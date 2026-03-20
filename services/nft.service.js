'use strict';

const { SyncInformation, StandardContract, Nft, NftHistory, Launchpad, Collection, NftAttribute } = require('@models');
const QueueService = require('moleculer-bull');
const queueConfig = require('@config/queue').QueueConfig;
const chainConfig = require('@config/chain').defaultChain;

const { ValidationError } = require('@helpers/errors');

const { CosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const HoroscopeClient = require('@helpers/horoscope/horoscope-client');
const _ = require('lodash');

module.exports = {
  name: 'nft',

  mixins: [QueueService(queueConfig.url, queueConfig.opts)],

  settings: {},

  dependencies: [],

  queues: {
    'sync.nfts': {
      concurrency: 1,
      process(job) {
        return this.syncNfts(job.data);
      },
    },

    'sync.nft-collection-metadata-and-nft-media': {
      concurrency: 1,
      async process(job) {
        return this.updateNftMetadataAndMedia(job.data);
      },
    },
  },

  actions: {
    resync: {
      params: {
        contract_address: 'string',
        token_id: 'string',
        $$strict: true,
      },
      async handler(ctx) {
        const contractAddress = ctx.params.contract_address;
        const tokenId = ctx.params.token_id;
        const nftQueryMessage = { all_nft_info: { token_id: tokenId } };
        const nftInfo = await this.client.queryContractSmart(contractAddress, nftQueryMessage).catch(() => {
          throw new ValidationError(
            `Cannot find Nft { contract_address: '${contractAddress}', token_id: '${tokenId}' } on chain.`,
          );
        });

        const extension = nftInfo.info.extension;
        const tokenUri = nftInfo.info.token_uri;
        const nftData = {
          name: extension ? extension.name : null,
          token_id: tokenId,
          metadata: extension,
          owner_address: nftInfo.access.owner,
          contract_address: contractAddress,
          token_uri: tokenUri,
        };

        // upsert nft
        let nft = await Nft.query().where({ contract_address: contractAddress, token_id: tokenId }).first();
        if (nft) {
          await nft.$query().patch(nftData);
        } else {
          nft = await Nft.query().insert(nftData).returning('id');
        }

        await this.broker.call('nft.updateNftMetadataAndMedia', {
          ..._.pick(nft, 'contract_address', 'token_id'),
          update_collection_metadata: false,
        });
      },
    },

    updateNftMetadataAndMedia: {
      params: {
        contract_address: 'string',
        token_id: 'string',
        update_collection_metadata: 'boolean|optional',
        $$strict: true,
      },
      async handler(ctx) {
        if (process.env.NODE_ENV === 'test') {
          return this.updateNftMetadataAndMedia(ctx.params);
        }

        return this.createJob('sync.nft-collection-metadata-and-nft-media', ctx.params, {
          removeOnComplete: 10,
          removeOnFail: 100,
          attempts: 7,
          // https://docs.bullmq.io/guide/retrying-failing-jobs#built-in-backoff-strategies
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        });
      },
    },
  },

  methods: {
    /**
     * Sync a limited number of Nfts & their activities.
     */
    async syncNfts() {
      await SyncInformation.transaction(async (transaction) => {
        // Prevent syncNfts() from running parallely by lock syncInfo record
        // This usually happens when a new instance of this application is deployed & start running while the old one is not yet fully closed
        const syncInformation = await SyncInformation.query(transaction)
          .findOne({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
          .forUpdate()
          .skipLocked();
        if (!syncInformation) {
          this.logger.info(`Sync Information ${SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID} is locked!`);
          return;
        }

        const supportedContracts = await StandardContract.query().where({ name: StandardContract.TYPES.CW2981 });

        const activities = await HoroscopeClient.getNftActivities({
          synced_id: parseInt(syncInformation.query),
          contract_code_ids: supportedContracts.map((contract) => contract.code_id),
          limit: 50,
        });

        for (let i = 0; i < activities.length; i++) {
          const activity = activities[i];
          await this.processHoroscopeNftActivity(activity);
          await syncInformation.$query(transaction).patch({ query: activity.cw721_activity_id });
        }
      });
    },

    /**
     * For one specific contract, its 'instantiate' activities of contract is avaliable on Horoscope befor 'mint',
     * and 'mint' before others.
     *
     * @param {*} activity activity data from horoscope
     */
    async processHoroscopeNftActivity(activity) {
      // just a fail-safe in case an awkward situation occurs that contract_address or token_id does not exist
      if (
        ['transfer_nft', 'send_nft', 'burn'].includes(activity.event) &&
        (activity.contract_address == null || activity.token_id == null)
      ) {
        this.logger.info(`Unsupported Horoscope activity ${activity}`);
        return;
      }

      switch (activity.event) {
        case 'instantiate': {
          const launchpad = await Launchpad.query().where({ collection_address: activity.contract_address }).first();
          // collection is created when deploy launchpad, so no need to sync instantiate activity here
          if (!launchpad) {
            await this.broker.call('collection.resync', { contract_address: activity.contract_address });
          }
          break;
        }
        case 'mint': {
          await Promise.all([
            Nft.query()
              .insert({
                contract_address: activity.contract_address,
                token_id: activity.token_id,
                owner_address: activity.to_address,
                metadata: {},
                burned_at: null, // to clear burned status when "re-mint" burned NFT
              })
              .onConflict(['contract_address', 'token_id'])
              .merge(),
            NftHistory.query().insert(_.omit(activity, 'cw721_activity_id')),
          ]);

          await this.broker.call('nft.updateNftMetadataAndMedia', _.pick(activity, 'contract_address', 'token_id'));
          break;
        }
        case 'transfer_nft': {
          await Promise.all([
            Nft.query()
              .update({ owner_address: activity.to_address })
              .where(_.pick(activity, 'contract_address', 'token_id')),
            NftHistory.query().insert(_.omit(activity, 'cw721_activity_id')),
            this.broker.emit('nft.transfer', _.pick(activity, 'token_id', 'contract_address', 'from_address')),
          ]);
          break;
        }
        case 'send_nft': {
          await Promise.all([
            Nft.query()
              .update({ owner_address: activity.to_address })
              .where(_.pick(activity, 'contract_address', 'token_id')),
            NftHistory.query().insert(_.omit(activity, 'cw721_activity_id')),
            this.broker.emit('nft.transfer', _.pick(activity, 'token_id', 'contract_address', 'from_address')),
          ]);
          break;
        }
        case 'burn': {
          const [nft] = await Promise.all([
            Nft.query()
              .where(_.pick(activity, 'contract_address', 'token_id'))
              .patch({ burned_at: new Date() })
              .returning('id'),
            NftHistory.query().insert(_.omit(activity, 'cw721_activity_id')),
          ]);
          await Promise.all([
            NftAttribute.query().delete().where({ nft_id: nft[0].id }),
            this.broker.call('sync-data.updateCollectionMetadata', { nft_id: nft[0].id }),
          ]);
          break;
        }
        default:
          this.logger.info(`Unsupported Horoscope Nft event: ${activity.event}`);
      }
    },

    async updateNftMetadataAndMedia({ contract_address, token_id, update_collection_metadata = true }) {
      const [collection, nftData] = await Promise.all([
        Collection.query().where({ contract_address }).withGraphFetched('standard_contract').first(),
        HoroscopeClient.getNft({ contract_address, token_id }),
      ]);

      if (collection && collection.standard_contract.name === StandardContract.TYPES.CW2981) {
        // Update Collection royalty info when the first NFT is minted
        if (!collection.royalty_payment_address) {
          const royaltyInfo = await this.client.queryContractSmart(contract_address, {
            extension: { msg: { royalty_info: { token_id, sale_price: '100' } } },
          });
          nftData.metadata.royalty_percentage = royaltyInfo.royalty_amount;
          nftData.metadata.royalty_payment_address = royaltyInfo.address;

          await collection
            .$query()
            .update({ royalty_percentage: royaltyInfo.royalty_amount, royalty_payment_address: royaltyInfo.address });
        } else {
          nftData.metadata.royalty_percentage = collection.royalty_percentage;
          nftData.metadata.royalty_payment_address = collection.royalty_payment_address;
        }
      }

      const nft = (
        await Nft.query()
          .patch(_.pick(nftData, 'name', 'metadata', 'token_uri'))
          .where({ contract_address, token_id })
          .returning('*')
      )[0];

      if (_.isEmpty(nftData?.metadata?.s3_image) && _.isEmpty(nftData?.metadata?.s3_animation)) {
        throw new Error(
          `Media info of Nft(contract_address: ${contract_address}, token_id: ${token_id}) doesn't exist`,
        );
      }

      if (update_collection_metadata) {
        await this.broker.call('sync-data.updateCollectionMetadata', { nft_id: nft.id });
      }
    },
  },

  async started() {
    if (process.env.NODE_ENV !== 'test') {
      await this.waitForServices(['api']);
      await Promise.all([
        this.broker.call('api.add_queue', { queue_name: 'sync.nfts' }),
        this.createJob('sync.nfts', {}, { repeat: { every: 3000 }, removeOnComplete: 10, removeOnFail: 100 }),
        this.broker.call('api.add_queue', { queue_name: 'sync.nft-collection-metadata-and-nft-media' }),
      ]);
    }
    this.client = await CosmWasmClient.connect(chainConfig.rpcEndpoint);
  },

  async stopped() {
    await this.getQueue('sync.nfts').close();
    await this.getQueue('sync.nft-collection-metadata-and-nft-media').close();
  },
};
