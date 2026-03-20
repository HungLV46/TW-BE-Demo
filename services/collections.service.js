/* eslint-disable no-tabs */

'use strict';

const { StandardContract, DeployedContract, Collection, CollectionVerification, Launchpad } = require('@models');

const DiscordClient = require('@helpers/social/discord');
const TwitterClient = require('@helpers/social/twitter');
const TelegramClient = require('@helpers/social/telegram');
const chainConfig = require('@config/chain').defaultChain;
const { ValidationError, ConflictError } = require('@helpers/errors');

const { CosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const _ = require('lodash');

module.exports = {
  name: 'collection',

  /**
   * Settings
   */
  settings: {},

  /**
   * Dependencies
   */
  dependencies: [],

  /**
   * Actions
   */
  actions: {
    resync: {
      params: {
        contract_address: 'string',
        $$strict: true,
      },
      handler(ctx) {
        return this.resync(ctx.params.contract_address);
      },
    },

    patch: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      params: {
        contract_address: 'string|min:1',
        name: 'string|optional|min:1|max:255',
        symbol: 'string|optional|min:1|max:255',
        description: 'string|optional',
        logo: 'string|optional|min:1',
        feature: 'string|optional|min:1',
        banner: 'string|optional|min:1',
        type: { type: 'enum', values: Collection.TYPES, optional: true },
        website: 'string|optional',
        slug: 'string|optional',
        $$strict: true,
      },
      async handler(ctx) {
        const updateParams = { ...ctx.params };
        delete updateParams.collection_address;

        const collection = await this.verifyCollectionOwnership(ctx);

        if (!collection.slug && !updateParams.slug) {
          // regenerate slug to keep its format: name + id
          updateParams.slug = collection.generateSlug(updateParams.name);
        }

        return collection
          .$query()
          .patch(updateParams)
          .catch((error) => {
            if (error.constraint === 'collections_slug_unique') {
              throw new ConflictError('The URL entered is already taken');
            }
            throw error;
          });
      },
    },

    updateAuthorization: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      params: {
        contract_address: 'string',
        authorization_code: 'string|optional',
        challenge_code: 'string|optional',
        authorization_object: 'object|optional',
        type: { type: 'enum', values: Object.values(CollectionVerification.TYPES) },
        $$strict: true,
      },
      async handler(ctx) {
        const params = ctx.params;

        await this.verifyCollectionOwnership(ctx);

        let verificationInfo;
        switch (params.type) {
          case CollectionVerification.TYPES.DISCORD:
            verificationInfo = await this.discordClient.verifyAuthorizationInfo(params.authorization_code);
            break;
          case CollectionVerification.TYPES.TWITTER:
            verificationInfo = await new TwitterClient().verifyAuthorizationInfo(
              params.authorization_code,
              params.challenge_code,
            );
            break;
          case CollectionVerification.TYPES.TELEGRAM:
            verificationInfo = await this.telegramClient.verifyAuthorizationInfo(params.authorization_object);
            break;
          default:
            throw new Error(`Social client type (${params.type}) is not supported!`);
        }

        // insert or update
        return CollectionVerification.query()
          .insert({
            contract_address: params.contract_address,
            type: params.type,
            authorization_info: verificationInfo.authorization_info,
            additional_info: verificationInfo.additional_info,
          })
          .onConflict(['contract_address', 'type'])
          .merge();
      },
    },

    updateSocialLink: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      params: {
        contract_address: 'string',
        social_link: 'string',
        type: { type: 'enum', values: [CollectionVerification.TYPES.DISCORD, CollectionVerification.TYPES.TELEGRAM] },
        $$strict: true,
      },
      async handler(ctx) {
        await this.verifyCollectionOwnership(ctx);
        const params = ctx.params;

        const authorization = await CollectionVerification.query()
          .where({ contract_address: params.contract_address, type: params.type })
          .first()
          .then((response) => response.authorization_info);

        let verificationData;
        if (params.type === CollectionVerification.TYPES.DISCORD) {
          verificationData = await this.discordClient.verifyInviteLink(authorization.access_token, params.social_link);
        } else {
          verificationData = await this.telegramClient.verifyInviteLink(authorization, params.social_link);
        }

        await CollectionVerification.query()
          .where({
            contract_address: params.contract_address,
            type: params.type,
          })
          .patch({ additional_info: verificationData, invite_link: params.social_link });
      },
    },

    removeSocialLink: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      params: {
        contract_address: 'string',
        type: { type: 'enum', values: Object.values(CollectionVerification.TYPES) },
        $$strict: true,
      },
      async handler(ctx) {
        await this.verifyCollectionOwnership(ctx);

        return CollectionVerification.query()
          .where({
            contract_address: ctx.params.contract_address,
            type: ctx.params.type,
          })
          .delete();
      },
    },
  },

  /**
   * Events
   */
  events: {},

  /**
   * Methods
   */
  methods: {
    formatResponse(response) {
      return { data: response };
    },

    verifyCollectionOwnership(ctx) {
      return Collection.query()
        .where({ contract_address: ctx.params.contract_address, owner_address: ctx.meta.user.aura_address })
        .whereNotDeleted()
        .first()
        .throwIfNotFound('Collection not found or user does not own the collection!');
    },

    async resync(contractAddress) {
      const onChainContract = await this.cosmWasmClient.getContract(contractAddress).catch(() => {
        throw new ValidationError(`Contract address '${contractAddress}' does not exist on chain.`);
      });

      // veirfy on chain contract is actually a CW2981 standard contract stored in DB
      const cw2981Contract = await StandardContract.query()
        .where({ name: StandardContract.TYPES.CW2981, code_id: onChainContract.codeId })
        .first()
        .throwIfNotFound(`Contract address '${contractAddress}' does not belong to a standard contract!`);

      const contractInfo = await this.cosmWasmClient.queryContractSmart(contractAddress, { contract_info: {} });
      const minterInfo = await this.cosmWasmClient.queryContractSmart(contractAddress, { minter: {} });

      const launchpad = await Launchpad.query().where({ collection_address: contractAddress }).first();
      const ownerAddress =
        launchpad && launchpad.collection_information?.creator
          ? launchpad.collection_information.creator
          : onChainContract.creator;
      const collectionData = {
        name: contractInfo.name,
        symbol: contractInfo.symbol,
        owner_address: ownerAddress,
        minter_address: minterInfo.minter,
        contract_address: contractAddress,
        standard_contract_id: cw2981Contract.id,
      };

      const hasRoyalty = (
        await this.cosmWasmClient.queryContractSmart(contractAddress, { extension: { msg: { check_royalties: {} } } })
      ).royalty_payments;
      if (hasRoyalty) {
        const token = (await this.cosmWasmClient.queryContractSmart(contractAddress, { all_tokens: { limit: 1 } }))
          .tokens[0];
        if (token) {
          const royaltyInfo = await this.cosmWasmClient.queryContractSmart(contractAddress, {
            extension: { msg: { royalty_info: { token_id: token, sale_price: '100' } } },
          });
          collectionData.royalty_percentage = royaltyInfo.royalty_amount;
          collectionData.royalty_payment_address = royaltyInfo.address;
        }
      }

      await DeployedContract.query()
        .insert({
          contract_address: contractAddress,
          standard_contract_id: cw2981Contract.id,
        })
        .onConflict()
        .ignore();

      const collection = await Collection.query().where({ contract_address: contractAddress }).first();
      // not re-generate slug when update
      if (collection) {
        await collection.$query().patch(collectionData);
      } else {
        await Collection.query()
          .insert(collectionData)
          .returning('id', 'name')
          .then((collection) => collection.$query().patch({ slug: collection.generateSlug() }));
      }
    },
  },

  async created() {
    this.discordClient = new DiscordClient();
    this.telegramClient = new TelegramClient();
    this.cosmWasmClient = await CosmWasmClient.connect(chainConfig.rpcEndpoint);
  },
};
