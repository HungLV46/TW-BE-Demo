'use strict';

const QueueService = require('moleculer-bull');
const queueConfig = require('@config/queue').QueueConfig;
const chainConfig = require('@config/chain').defaultChain;

const {
  SyncInformation, StandardContract, DeployedContract, SyncTx
} = require('@models');

const { logs } = require('@cosmjs/stargate');
const { SigningCosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const { decodeTxRaw } = require('@cosmjs/proto-signing');
const { fromUtf8 } = require('@cosmjs/encoding');
const _ = require('lodash');

module.exports = {
  name: 'sync-block',
  mixins: [QueueService(queueConfig.url, queueConfig.opts)],

  settings: {
    max_sync_block: 10,
  },

  queues: {
    // sync block every 5s
    'sync.block': {
      concurrency: 1,
      process(job) {
        return this.actions.syncBlock(job.data);
      },
    },
  },

  actions: {
    // sync every blocks from rpc
    syncBlock: {
      visibility: 'protected',
      async handler() {
        return this.syncBlock();
      },
    },
  },

  methods: {
    /* eslint-disable no-await-in-loop */
    async syncBlock() {
      try {
        await SyncInformation.transaction(async (transaction) => {
          // Prevent syncBlock() from running parallely by lock syncInfo record
          // This usually happens when a new instance of this application is deployed & start running while the old one is not yet fully closed
          const syncInfo = await SyncInformation.query(transaction)
            .findOne({ key: 'last-block-synced' })
            .forUpdate()
            .skipLocked();
          if (!syncInfo) {
            this.logger.info("Sync Information 'last-block-synced' is locked!");
            return;
          }
          let latestBlock = await this.client.getBlock();
          this.block = await this.client.getBlock(syncInfo.height + 1);

          // get list of active contracts
          const contracts = await StandardContract.query().where({ status: 'active' });
          // map by code_id, this could be error when we update contract code
          this.contractsByCodeId = _.keyBy(contracts, 'code_id');

          // https://github.com/OptimalBits/bull#important-notes
          // prevent the job processor from being considered stalled resulting in the job running several times
          const syncToHeight = Math.min(latestBlock.header.height, syncInfo.height + 1 + this.settings.max_sync_block);
          // we only sync to latestBlock.header.height - 1
          // because we suspect that data of the latest block is not finalized yet
          while (this.block.header.height < syncToHeight) {
            this.logger.info(`Sync block ${this.block.header.height}`);
            // check through every transactions in block

            const txs = await this.client.searchTx(`tx.height=${this.block.header.height}`);
            this.logger.info(`Got ${txs.length} txs`);

            if (txs.length > 0) {
              // We use a for loop for better error handling
              // const promises = txs.map(async tx => {
              for (let i = 0; i < txs.length; i += 1) {
                const tx = txs[i];
                // only process txs with success status
                if (tx.code === 0) {
                  const decodedTx = decodeTxRaw(tx.tx);
                  // this.logger.info('Decoded tx', decodedTx);
                  // decodedTx.body.messages.forEach(async (msg, msgIndex) => {
                  for (let msgIndex = 0; msgIndex < decodedTx.body.messages.length; msgIndex += 1) {
                    const msg = decodedTx.body.messages[msgIndex];
                    this.logger.info(`Found new tx ${msg.typeUrl}: ${tx}`);
                    switch (msg.typeUrl) {
                      case '/cosmwasm.wasm.v1.MsgExecuteContract': {
                        const newMsg = {
                          ...msg,
                          value: {
                            ...this.client.registry.types.get(msg.typeUrl).decode(msg.value),
                            txHash: tx.hash,
                            txTime: new Date(this.block.header.time), // block.header.time is UTC nanosec
                            blockHeight: this.block.header.height,
                            msgIndex,
                          },
                        };
                        const contract = await DeployedContract.query()
                          .withGraphJoined('standardContract')
                          .findOne('contract_address', '=', newMsg.value.contract);
                        if (contract) {
                          if (newMsg.value.msg) {
                            newMsg.value.msg = JSON.parse(fromUtf8(newMsg.value.msg));
                          }

                          // TODO optimize
                          // here, we know that this transaction is of interest
                          // we will store a SyncTx for further reference

                          const syncTx = await SyncTx.query().insert({
                            hash: newMsg.value.txHash,
                            height: newMsg.value.blockHeight,
                            msg_index: msgIndex,
                            block_time: newMsg.value.txTime,
                            raw_data: JSON.stringify(newMsg.value),
                          });

                          newMsg.value.syncTxId = syncTx.id;

                          switch (contract.standardContract.name) {
                            case StandardContract.TYPES.MARKETPLACE: {
                              const events = logs.parseRawLog(tx.rawLog)[0].events;
                              await this.broker.call('marketplace.processTransaction', {
                                contract,
                                txMsg: newMsg.value,
                                events,
                              });
                              this.logger.info('Done processing marketplace');
                              break;
                            }
                            case StandardContract.TYPES.AUCTION: {
                              const events = logs.parseRawLog(tx.rawLog)[0].events;
                              await this.broker.call('auction.processTransaction', {
                                contract,
                                txMsg: newMsg.value,
                                events,
                              });
                              this.logger.info('Done processing auction');
                              break;
                            }
                            default:
                              this.logger.error(`Unknown contract type "${contract.standardContract.name}"`);
                          }
                        } else {
                          this.logger.info(`Not tracked contract ${newMsg.value.contract}`);
                        }
                        break;
                      }
                      default: {
                        this.logger.info(`Unknown tx type ${msg.typeUrl}`);
                        // do nothing
                      }
                    }
                  }
                }
                // });
                // });
              }

              // await Promise.all(promises);
            }
            await syncInfo.$query(transaction).patch({ height: this.block.header.height });
            this.block = await this.client.getBlock(syncInfo.height + 1);
          }
        });
      } catch (error) {
        const errorMessage = this.convertErrorMessageIfPossible(error);
        if (errorMessage && errorMessage.code === -32603) {
          // this.logger.info('Sync reach high limit.');
        } else {
          this.logger.error(error);
          throw error;
        }
      }
    },

    convertErrorMessageIfPossible(error) {
      try {
        return JSON.parse(error.message);
      } catch (e) {
        return null;
      }
    },
  },

  async created() {
    this.client = await SigningCosmWasmClient.connectWithSigner(chainConfig.rpcEndpoint, chainConfig.mnemonic);
  },

  async started() {
    if (process.env.NODE_ENV !== 'test') {
      await this.createJob('sync.block', {}, { repeat: { every: 1000 }, removeOnComplete: true, removeOnFail: 100 });
      await this.waitForServices(['api']);
      await this.broker.call('api.add_queue', { queue_name: 'sync.block' });
    }
  },

  async stopped() {
    await this.getQueue('sync.block').close();
  },
};
