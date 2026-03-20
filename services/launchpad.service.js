/* eslint-disable no-await-in-loop */

'use strict';

const chainConfig = require('@config/chain').defaultChain;
const queueConfig = require('@config/queue').QueueConfig;

const {
  StandardContract, Launchpad, MintPhase, DeployedContract, Collection
} = require('@models');
const { setupBlockchainClient, findAttributeValueFromEvents } = require('@helpers/blockchain_utils');
const { ValidationError } = require('@helpers/errors');
const QueueService = require('moleculer-bull');
const { toUtf8 } = require('@cosmjs/encoding');
const _ = require('lodash');

module.exports = {
  name: 'launchpad',

  mixins: [QueueService(queueConfig.url, queueConfig.opts)],
  queues: {
    'launchpad.update-minting': {
      concurrency: 1,
      name: 'launchpad.update-minting.job',
      process(job) {
        console.log('**LaunchpadUpdateMintingJob**');
        return this.updateStatus(job.data.launchpadId, Launchpad.STATUSES.MINTING).then((data) => {
          console.log(`LaunchpadUpdateMintingJob success! ${data} launchpad updated`);
        });
      },
    },
    'launchpad.update-finished': {
      concurrency: 1,
      process(job) {
        console.log('**LaunchpadUpdateFinishedJob**');
        return this.updateStatus(job.data.launchpadId, Launchpad.STATUSES.FINISHED).then((data) => {
          console.log(`LaunchpadUpdateFinishedJob success! ${data} launchpad updated`);
        });
      },
    },
  },

  actions: {
    // import launchpad information from blockchain
    // we expect the launchpad contract address is already deployed
    // and the information should be matched with the database
    import: {
      params: {
        launchpad_id: 'number',
        contract_address: 'string',
        overwrite: 'boolean|optional|default:false',
        $$strict: true,
      },
      // TODO refactor: clean the code and avoid insert into DB in loop
      async handler(ctx) {
        // get the launchpad from database
        let launchpad = await Launchpad.query().findById(ctx.params.launchpad_id).withGraphFetched('mintPhases');
        let mintPhases = launchpad.mintPhases;

        // get the launchpad information from blockchain
        const launchpadInfo = await this.client.queryContractSmart(ctx.params.contract_address, {
          get_launchpad_info: {},
        });

        // we need to check if contract_address matched or not exists
        if (!launchpad.contract_address) {
          launchpad = await launchpad.$query().patch({ contract_address: ctx.params.contract_address }).returning('*');
        } else if (launchpad.contract_address !== ctx.params.contract_address) {
          throw new Error('Launchpad contract address mismatch');
        }

        // we assume that database is newer than blockchain, and we will check if the blockchain updates are correct
        // however, if overwrite is true, we will update the database with the blockchain information
        const LAUNPAD_VERIFICATION_FIELDS = [
          'creator',
          'total_supply',
          'uri_prefix',
          'uri_suffix',
          'max_supply',
          'launchpad_fee',
        ];
        if (
          !_.isEqual(_.pick(launchpadInfo, LAUNPAD_VERIFICATION_FIELDS), {
            ..._.pick(launchpad.collection_information, LAUNPAD_VERIFICATION_FIELDS),
            total_supply: 0,
            launchpad_fee: launchpad.project_information.launchpad_fee,
          })
        ) {
          if (ctx.params.overwrite) {
            // update the database
            launchpad = await launchpad
              .$query()
              .patch({
                contract_address: ctx.params.contract_address,
                collection_address: launchpadInfo.collection_address,
                status: launchpadInfo.is_active ? Launchpad.STATUSES.READY_TO_MINT : Launchpad.STATUSES.DEPLOYED,
                project_information: {
                  launchpad_fee: launchpadInfo.launchpad_fee,
                  total_supply: launchpadInfo.total_supply,
                },
                collection_information: {
                  creator: launchpadInfo.creator,
                  uri_prefix: launchpadInfo.uri_prefix,
                  uri_suffix: launchpadInfo.uri_suffix,
                  max_supply: launchpadInfo.max_supply,
                },
              })
              .returning('*');
          } else {
            throw new Error('Launchpad information mismatch');
          }
        }

        // check mint phases
        const mintPhaseInfos = await this.client.queryContractSmart(ctx.params.contract_address, {
          get_all_phase_configs: {},
        });

        // compare mint phases with the database one by one
        const MINT_PHASE_VERIFICATION_FIELDS = [
          'phase_id',
          'start_time',
          'end_time',
          'max_supply',
          'max_nfts_per_address',
          'price',
        ];

        const updatedMintPhases = [];
        // TODO: implement logic when mintPhaseInfos.length !== launchpad.mintPhases.length
        for (let i = 0; i < mintPhaseInfos.length; i += 1) {
          const mintPhaseInfo = mintPhaseInfos[i];
          const mintPhase = mintPhases[i];
          if (
            !_.isEqual(
              _.pick(mintPhaseInfo, MINT_PHASE_VERIFICATION_FIELDS),
              _.pick(mintPhase.config, MINT_PHASE_VERIFICATION_FIELDS),
            )
          ) {
            if (!ctx.params.overwrite) {
              throw new Error(`Mint phase ${i} information mismatch`);
            } else {
              mintPhases.push(
                // eslint-disable-next-line no-await-in-loop
                await mintPhase.$query().patch({
                  phase_id: mintPhaseInfo.phase_id,
                  starts_at: new Date(
                    parseInt(mintPhaseInfo.start_time.substring(0, mintPhaseInfo.start_time.length - 6), 10), // TODO refactor
                  ),
                  ends_at: new Date(
                    parseInt(mintPhaseInfo.end_time.substring(0, mintPhaseInfo.end_time.length - 6), 10), // TODO refactor
                  ),
                  config: {
                    phase_id: mintPhaseInfo.phase_id,
                    start_time: mintPhaseInfo.start_time,
                    end_time: mintPhaseInfo.end_time,
                    max_supply: mintPhaseInfo.max_supply,
                    total_supply: mintPhaseInfo.total_supply,
                    max_nfts_per_address: mintPhaseInfo.max_nfts_per_address,
                    price: mintPhaseInfo.price,
                    is_public: mintPhaseInfo.is_public,
                  },
                }),
              );
            }
          } else {
            updatedMintPhases.push(mintPhase);
          }
        }

        // TODO implement whitelist logic
        launchpad.mintPhases = updatedMintPhases;
        return { launchpad };
      },
    },

    deploy: {
      openapi: { security: [{ bearerAuth: [] }] },
      params: {
        launchpad_id: 'number',
        $$strict: true,
      },
      async handler(ctx) {
        this.verifyChainEnvironment();

        try {
          const launchpadId = ctx.params.launchpad_id;
          const launchpad = await Launchpad.query().findById(launchpadId);

          // instantiate launchpad
          const cw2981Contract = await StandardContract.query()
            .where({
              name: StandardContract.TYPES.CW2981,
              status: StandardContract.STATUSES.ACTIVE,
            })
            .first();
          const instantiateMessage = await launchpad.getInstantiateMessage(cw2981Contract.code_id);
          const instantiateResponse = await this.instantiateLaunchpad(instantiateMessage);
          // update DB launchpad & collection
          const launchpadContractAddress = instantiateResponse.contractAddress;
          const collectionContractAddress = findAttributeValueFromEvents(
            instantiateResponse.logs[0].events,
            'wasm',
            'collection_address',
          ).value;

          const launchpadContract = await StandardContract.query()
            .where({
              name: StandardContract.TYPES.LAUNCHPAD,
              status: StandardContract.STATUSES.ACTIVE,
            })
            .first();
          // insert deployed contract relating to collection. Those of launchpad will be inserted in sync-block service processNewContract() function
          await DeployedContract.query().insertGraph([
            {
              contract_address: launchpadContractAddress,
              standard_contract_id: launchpadContract.id,
            },
            {
              contract_address: collectionContractAddress,
              standard_contract_id: cw2981Contract.id,
            },
          ]);

          // clean up some data if launchpad is deployed before
          if (launchpad.contract_address) {
            await MintPhase.query().where({ launchpad_id: launchpad.id }).update({ phase_id: null });
          }

          launchpad.contract_address = launchpadContractAddress;
          launchpad.collection_address = collectionContractAddress;
          const collection = await this.createCollectionFromLaunchpad(launchpad);
          await launchpad.$query().update({
            status: Launchpad.STATUSES.DEPLOYED,
            contract_address: launchpadContractAddress,
            collection_address: collectionContractAddress,
            slug: launchpad.slug || collection.slug,
          });

          return instantiateResponse;
        } catch (error) {
          throw new ValidationError(error.toString());
        }
      },
    },

    add_mint_phases_and_whitelists: {
      openapi: { security: [{ bearerAuth: [] }] },
      params: {
        launchpad_id: 'number',
        $$strict: true,
      },
      async handler(ctx) {
        this.verifyChainEnvironment();
        const launchpadId = ctx.params.launchpad_id;
        const launchpad = await Launchpad.query().findById(launchpadId);
        const launchpadContractAddress = launchpad.contract_address;

        try {
          // add mint phases & update DB
          let mintPhases = await MintPhase.query()
            .withGraphFetched('whitelists')
            .where({ launchpad_id: launchpadId })
            .orderBy('starts_at');
          let addMintPhaseResponse;
          let addWhitelistResponse;
          if (launchpad.status === Launchpad.STATUSES.INACTIVE) {
            const notRunMintPhases = mintPhases.filter((phase) =>
              Date.parse(phase.starts_at) > new Date().getTime());
            addWhitelistResponse = await this.updateWhitelists(launchpadContractAddress, notRunMintPhases);
          } else {
            addMintPhaseResponse = await this.updateMintPhases(launchpadContractAddress, mintPhases);
            addWhitelistResponse = await this.updateWhitelists(launchpadContractAddress, mintPhases);
          }

          await launchpad.$query().update({ synced_on_chain: true });
          return {
            add_result: {
              mint_phases: addMintPhaseResponse,
              whitelists: addWhitelistResponse,
            },
          };
        } catch (error) {
          if (error.message.includes('Launchpad started')) {
            if (launchpad.status === Launchpad.STATUSES.DEPLOYED) {
              await this.updateStatusAfterActivate(launchpad);
            }

            throw new ValidationError('Deactivate launchpad to edit mint phases and whitelists');
          }
          throw new ValidationError(error.toString());
        }
      },
    },

    activate: {
      openapi: { security: [{ bearerAuth: [] }] },
      params: {
        launchpad_id: 'number',
        $$strict: true,
      },
      async handler(ctx) {
        this.verifyChainEnvironment();

        try {
          const launchpadId = ctx.params.launchpad_id;
          const launchpad = await Launchpad.query().findById(launchpadId);
          const mintPhases = await MintPhase.query().where({ launchpad_id: launchpadId }).orderBy('starts_at', 'asc');

          if (!this.isReadyToMint(mintPhases, launchpad)) {
            throw new ValidationError('Launchpad is not ready to mint');
          }

          const activateLaunchpadMessage = { activate_launchpad: {} };
          const activateLaunchpadResponse = await this.client.execute(
            this.instantiatorAddress,
            launchpad.contract_address,
            activateLaunchpadMessage,
            'auto',
          );
          await Promise.all([
            this.createJobUpdateMinting(launchpad, mintPhases[0]),
            this.createJobUpdateFinished(launchpad, mintPhases[mintPhases.length - 1]),
            this.updateStatusAfterActivate(launchpad),
          ]);

          return activateLaunchpadResponse;
        } catch (error) {
          const launchpadActivatedMessage = 'Launchpad is already activated';
          if (error.message.includes(launchpadActivatedMessage)) throw new ValidationError(launchpadActivatedMessage);
          throw new ValidationError(error.toString());
        }
      },
    },

    deactivate: {
      openapi: { security: [{ bearerAuth: [] }] },
      params: {
        launchpad_id: 'number',
        $$strict: true,
      },
      async handler(ctx) {
        this.verifyChainEnvironment();

        try {
          const launchpadId = ctx.params.launchpad_id;
          const launchpad = await Launchpad.query().findById(launchpadId);
          const deactivateLaunchpadMessage = { deactivate_launchpad: {} };
          const deactivateLaunchpadResponse = await this.client.execute(
            this.instantiatorAddress,
            launchpad.contract_address,
            deactivateLaunchpadMessage,
            'auto',
          );

          await Promise.all([
            this.removeCachedLaunchpadUpdateJobs(launchpadId),
            this.updateStatusAfterDeactivate(launchpad),
          ]);

          return deactivateLaunchpadResponse;
        } catch (error) {
          const launchpadDeactivatedMessage = 'Launchpad is already deactivated';
          if (error.message.includes(launchpadDeactivatedMessage)) {
            throw new ValidationError(launchpadDeactivatedMessage);
          }
          throw new ValidationError(error.toString());
        }
      },
    },

    publish: {
      openapi: { security: [{ bearerAuth: [] }] },
      params: {
        launchpad_id: 'number',
        $$strict: true,
      },
      async handler(ctx) {
        this.verifyChainEnvironment();

        return this.updatePublishedAt(ctx.params.launchpad_id, new Date());
      },
    },

    unpublish: {
      openapi: { security: [{ bearerAuth: [] }] },
      params: {
        launchpad_id: 'number',
        $$strict: true,
      },
      async handler(ctx) {
        this.verifyChainEnvironment();

        return this.updatePublishedAt(ctx.params.launchpad_id, null);
      },
    },
  },

  methods: {
    verifyChainEnvironment() {
      if (
        process.env.CHAIN_ID
        && ['local', 'aura-testnet-2', 'serenity', 'euphoria', 'xstaxy-1'].indexOf(process.env.CHAIN_ID) === -1
      ) {
        throw new ValidationError(`This API is not supportd on chain ${process.env.CHAIN_ID}.`);
      }
    },

    async instantiateLaunchpad(instantiateMessage) {
      const launchpadContract = await StandardContract.query()
        .where({
          name: 'nft-launchpad',
          status: 'active',
        })
        .first();

      return this.client.instantiate(
        this.instantiatorAddress,
        parseInt(launchpadContract.code_id, 10),
        instantiateMessage,
        `${launchpadContract.code_id} instance`,
        'auto',
      );
    },

    async createCollectionFromLaunchpad(launchpad) {
      const cw2981Contract = await StandardContract.query()
        .where({
          name: StandardContract.TYPES.CW2981,
          status: StandardContract.STATUSES.ACTIVE,
        })
        .first();

      const collection = launchpad.getCollection(cw2981Contract.id, launchpad.collection_address);

      // in case of nft.service synced instantiation first, TODO remove onConflict
      const insertedCollcetion = await Collection.query()
        .insertGraph(collection)
        .onConflict(['contract_address'])
        .merge()
        .returning('*');
      const slug = insertedCollcetion.generateSlug();
      await insertedCollcetion.$query().patch({ slug });

      return { slug };
    },

    async execute(contractAddress, messages) {
      if (_.isEmpty(messages)) return null;

      const addMessages = messages.map((message) =>
        ({
          typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
          value: {
            sender: this.instantiatorAddress,
            contract: contractAddress,
            msg: toUtf8(JSON.stringify(message)),
          },
        }));
      return this.client.signAndBroadcast(this.instantiatorAddress, addMessages, 'auto');
    },

    // has side effect: update dbPhases[].phase_id
    async updatePhaseId(dbPhases, blockchainPhases) {
      if (dbPhases.length !== blockchainPhases.length) throw new Error('Number of mint phases in DB and Blockchain mismatch!');

      const updateMintPhasePromises = [];
      dbPhases.forEach((dbPhase, index) => {
        const blockchainPhase = blockchainPhases[index];
        if (dbPhase.config.start_time !== blockchainPhase.start_time) throw new Error('Start time of mint phases in DB and blockchain mismatch');

        // eslint-disable-next-line no-param-reassign
        dbPhase.phase_id = blockchainPhase.phase_id;
        updateMintPhasePromises.push(dbPhase.$query().patch({ phase_id: blockchainPhase.phase_id }).returning('*'));
      });
      return Promise.all(updateMintPhasePromises);
    },

    isReadyToMint(mintPhases, launchpad) {
      return mintPhases && mintPhases.length > 0 && launchpad.contract_address;
    },

    async updatePublishedAt(launchpadId, publishedAt) {
      const launchpad = await Launchpad.query().findById(launchpadId);

      return launchpad.$query().update({ published_at: publishedAt });
    },

    async updateStatusAfterActivate(launchpad) {
      if (launchpad.status === Launchpad.STATUSES.INACTIVE) {
        return launchpad.$query().update({ status: Launchpad.STATUSES.MINTING });
      }

      return launchpad.$query().update({ status: Launchpad.STATUSES.READY_TO_MINT });
    },

    async updateStatusAfterDeactivate(launchpad) {
      if (launchpad.status === Launchpad.STATUSES.MINTING) {
        return launchpad.$query().update({ status: Launchpad.STATUSES.INACTIVE });
      }

      return launchpad.$query().update({ status: Launchpad.STATUSES.DEPLOYED });
    },

    async createJobUpdateMinting(launchpad, mintPhase) {
      const delay = this.calculateDelay(mintPhase.starts_at);
      return this.createJob(
        'launchpad.update-minting',
        'launchpad.update-minting.job',
        {
          launchpadId: launchpad.id,
        },
        {
          delay,
          removeOnComplete: true,
          removeOnFail: 100,
          jobId: `launchpad.update-minting.job:${launchpad.id}`,
        },
      );
    },

    async createJobUpdateFinished(launchpad, mintPhase) {
      const delay = this.calculateDelay(mintPhase.ends_at);
      return this.createJob(
        'launchpad.update-finished',
        {
          launchpadId: launchpad.id,
        },
        {
          delay,
          removeOnComplete: true,
          removeOnFail: 100,
          jobId: `launchpad.update-finished.job:${launchpad.id}`,
        },
      );
    },

    removeCachedLaunchpadUpdateJobs(launchpadId) {
      return Promise.all([
        this.getQueue('launchpad.update-minting').removeJobs(`*launchpad.update-minting.job:${launchpadId}`),
        this.getQueue('launchpad.update-finished').removeJobs(`*launchpad.update-finished.job:${launchpadId}`),
      ]);
    },

    updateStatus(launchpadId, status) {
      return Launchpad.query().update({ status }).where('id', launchpadId);
    },

    calculateDelay(time) {
      return new Date(time) - new Date();
    },

    async updateMintPhases(launchpadContractAddress, mintPhases) {
      const mintPhaseQueryMessage = { get_all_phase_configs: {} };
      const prevMintPhases = await this.client.queryContractSmart(launchpadContractAddress, mintPhaseQueryMessage);
      // Since FE can only add phases at the end, the array will have the following format:
      // add/update messages followed by delete messages if they exist.
      const modifyPhaseMessages = MintPhase.convertToModifyMessages(mintPhases, prevMintPhases);
      const addMintPhaseResponse = await this.execute(launchpadContractAddress, modifyPhaseMessages);
      const currentMintPhases = await this.client.queryContractSmart(launchpadContractAddress, mintPhaseQueryMessage);
      await this.updatePhaseId(mintPhases, currentMintPhases);

      return addMintPhaseResponse;
    },

    async updateWhitelists(launchpadContractAddress, mintPhases) {
      // add whitelist (beside from adding new whilists, readd all those of old phases)
      const addWhitelistMessages = MintPhase.convertToAddWhitelistMessages(mintPhases);
      return this.execute(launchpadContractAddress, addWhitelistMessages);
    },
  },

  async created() {
    const setup = await setupBlockchainClient(chainConfig);
    this.client = setup.client;
    this.instantiatorAddress = (await setup.wallet.getAccounts())[0].address;
  },
};
