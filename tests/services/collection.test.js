'use strict';

jest.mock('@helpers/social/discord');
jest.mock('@helpers/social/twitter');
jest.mock('@helpers/social/telegram');

const { ServiceBroker, Context } = require('moleculer');
const knex = require('@config/database');
const { ref } = require('objection');
const {
  User, Collection, CollectionVerification, StandardContract
} = require('@models');
const _ = require('lodash');

const CollectionServiceSchema = require('@services/collections.service');
const NftServiceSchema = require('@services/nft.service');
const SyncBlockServiceSchema = require('@services/sync_block.service');
const SyncDataServiceSchema = require('@services/sync_data.service');
const DiscordClient = require('@helpers/social/discord');
const { CollectionFactory } = require('../factories/collection_factory');
const { randomAddress } = require('../helpers/test-utility');

describe('Test collection', () => {
  DiscordClient.checkContainsAdminPermission = () =>
    true; // mock checkContainsAdminPermission function
  let broker = new ServiceBroker({ logger: false });
  let context = new Context(broker, { logger: false });
  broker.createService(CollectionServiceSchema);
  broker.createService(NftServiceSchema);
  broker.createService(SyncBlockServiceSchema, { settings: { max_sync_block: 100 } });
  broker.createService(SyncDataServiceSchema);

  beforeAll(async () => {
    await Promise.all([knex.seed.run({ specific: 'user.seed.js' }), knex.seed.run({ specific: 'collection.seed.js' })]);

    await broker.start();
  });

  afterAll(async () => {
    await broker.stop();
  });

  describe('Test PATCH /api/collections/:contract_address', () => {
    it('Patch success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };
      await user.collections[0].$query().patch({ slug: null });

      const newData = {
        contract_address: contractAddress,
        name: 'abc xyz',
        description: 'descriptionxxx',
        logo: 'https://logoxxx.png',
        feature: 'https://featurexxx.png',
        banner: 'https://bannerxxx.png',
        type: 'Photography',
        website: 'https://websitexxx.com',
      };

      // execute.
      await context.call('collection.patch', newData);

      // verify.
      delete newData.contractAddress;
      const patchedCollection = await Collection.query()
        .select(Collection.selectableProps)
        .where({ contract_address: contractAddress })
        .first();
      newData.slug = 'abc-xyz-' + patchedCollection.id;
      expect(patchedCollection).toMatchObject(newData);
    });

    it('cannot change type to invalid type', async () => {
      try {
        // setup.
        const user = await User.query()
          .withGraphJoined('collections')
          .orderBy('users.id', 'asc')
          .whereNull(ref('collections.deleted_at'))
          .first();
        const contractAddress = user.collections[0].contract_address;
        context.meta = { user: { aura_address: user.aura_address } };

        const newData = {
          contract_address: contractAddress,
          type: 'invalid type',
        };

        // execute.
        await context.call('collection.patch', newData);
      } catch (error) {
        // verify.
        expect(error.code).toBe(422);
        expect(error.message).toBe('Parameters validation error!');
      }
    });

    it('Not found collection', async () => {
      try {
        // execute.
        await context.call('collection.patch', {
          contract_address: 'aura1randomstring',
          name: 'namexxx',
          type: 'Others',
        });
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('Collection not found or user does not own the collection!');
      }
    });

    it('Cannot patch deleted collection', async () => {
      try {
        // setup
        const collection = await Collection.query().first();
        await Collection.query()
          .where({
            contract_address: collection.contract_address,
          })
          .patch({ deleted_at: '2022-08-11 07:15:14' }); // delete 1 record

        // execute.
        await context.call('collection.patch', {
          contract_address: collection.contract_address,
          name: 'namexxx',
          type: 'Others',
        });
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('Collection not found or user does not own the collection!');
      }
    });

    it('User does not own the collection', async () => {
      try {
        // setup.
        const user = await User.query().select('id', 'aura_address').orderBy('id', 'asc').first();
        const collection = await Collection.query().where({ owner_address: user.aura_address }).first();
        context.meta = { user: { aura_address: user.aura_address + 'x' } };

        // execute.
        await context.call('collection.patch', {
          contract_address: collection.contract_address,
          name: 'namexxx',
          type: 'Others',
        });
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('Collection not found or user does not own the collection!');
      }
    });

    it('Slug duplicate', async () => {
      // setup.
      const cw2981 = await StandardContract.query()
        .where({ name: StandardContract.TYPES.CW2981, status: 'active' })
        .first();
      const collections = CollectionFactory.buildList(2, { standard_contract_id: cw2981.id });
      collections[1].contract_address = randomAddress();
      await Collection.query().insertGraph(collections);

      context.meta = { user: { aura_address: collections[1].owner_address } };

      try {
        // execute.
        await context.call('collection.patch', {
          contract_address: collections[1].contract_address,
          slug: collections[0].slug,
        });
      } catch (error) {
        expect(error.code).toBe(409);
        expect(error.message).toBe('The URL entered is already taken');
      }
    });
  });

  describe('PATCH /collections/:contract_address/update_authorization', () => {
    it('Discord: Update authorization success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };

      const authorizationData = {
        contract_address: contractAddress,
        authorization_code: 'Z9tVBaJ23Nn5bwjmiqMd9T3HJKWXo4',
        type: CollectionVerification.TYPES.DISCORD,
      };

      // execute.
      await context.call('collection.updateAuthorization', authorizationData);

      // verify.
      const collectionVerification = await CollectionVerification.query()
        .where({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.DISCORD,
        })
        .first();

      expect(_.isEmpty(collectionVerification.authorization_info.access_token)).toBeFalsy();
    });

    it('Twitter: Update authorization success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };

      const authorizationData = {
        contract_address: contractAddress,
        authorization_code:
          'TXdKU1owMHpETlg4VEVzT25hTmNCQ1RZdG9JbkxDMlZSV214Y3NMZ2FtcUZUOjE2NzA2NDY0MTgxMDU6MTowOmFjOjE',
        challenge_code: 'codeChallenge', // matching with code_challenge in authorization URL (code_challenge_method = plain)
        type: CollectionVerification.TYPES.TWITTER,
      };

      // execute.
      await context.call('collection.updateAuthorization', authorizationData);

      // verify.
      const collectionVerification = await CollectionVerification.query()
        .where({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.TWITTER,
        })
        .first();

      expect(_.isEmpty(collectionVerification.additional_info.username)).toBeFalsy();
      expect(_.isEmpty(collectionVerification.additional_info.profile_link)).toBeFalsy();
    });

    it('Telegram: Update authorization success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };

      const authorizationData = {
        contract_address: contractAddress,
        authorization_object: {
          id: 1111,
          first_name: 'xxxx',
          last_name: 'xxxx',
          username: 'xxxx',
          photo_url: 'https://t.me/i/userpic/xxxx_asy.jpg',
          auth_date: 1671088525,
          hash: '9043221e2f0b7c29e31c687f942f66cca71b37de33c213d1d35fe56e93d26fd9',
        },
        type: CollectionVerification.TYPES.TELEGRAM,
      };

      // execute.
      await context.call('collection.updateAuthorization', authorizationData);

      // verify.
      const collectionVerification = await CollectionVerification.query()
        .where({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.TELEGRAM,
        })
        .first();

      expect(_.isNumber(collectionVerification.authorization_info.id)).toBeTruthy();
    });
  });

  describe('PATCH /collections/:contract_address/update_social_link', () => {
    it('Discord: Update social link success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };

      const authorizationData = {
        contract_address: contractAddress,
        authorization_code: 'R7sG7fNIZfFd9AEIGSK4wtGF2vK2Gt',
        type: CollectionVerification.TYPES.DISCORD,
      };
      await context.call('collection.updateAuthorization', authorizationData);

      // execute.
      const updateData = {
        contract_address: contractAddress,
        social_link: 'https://discord.gg/gzeZ3DRvfg',
        type: CollectionVerification.TYPES.DISCORD,
      };
      await context.call('collection.updateSocialLink', updateData);

      // verify.
      const collectionVerification = await CollectionVerification.query()
        .where({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.DISCORD,
        })
        .first();

      expect(_.isEmpty(collectionVerification.additional_info.guild_name)).toBeFalsy();
      expect(_.isEmpty(collectionVerification.additional_info.username)).toBeFalsy();
      expect(collectionVerification.invite_link).toBe(updateData.social_link);
    });

    it('Telegram: Update social link success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };

      const authorizationData = {
        contract_address: contractAddress,
        authorization_object: {
          id: 5528016998,
          first_name: 'Lê Văn',
          last_name: 'Hùng',
          username: 'HungLV46',
          photo_url: 'https://t.me/i/userpic/320/gy_L5Q2zLLZyUrtCw0Fh9D0oy0CuabiM2A0-68FY27Inz94yP7ypxCrAF7G7_asy.jpg',
          auth_date: 1671088525,
          hash: '9043221e2f0b7c29e31c687f942f66cca71b37de33c213d1d35fe56e93d26fd9',
        },
        type: CollectionVerification.TYPES.TELEGRAM,
      };

      await context.call('collection.updateAuthorization', authorizationData);

      // execute.
      const updateData = {
        contract_address: contractAddress,
        social_link: 'https://t.me/twilightfake',
        type: CollectionVerification.TYPES.TELEGRAM,
      };
      await context.call('collection.updateSocialLink', updateData);

      // verify.
      const collectionVerification = await CollectionVerification.query()
        .where({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.TELEGRAM,
        })
        .first();

      expect(collectionVerification.invite_link).toBe(updateData.social_link);
    });
  });

  describe('DELETE /collections/:contract_address/remove_social_link', () => {
    it('Discord: delete social link success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };

      await CollectionVerification.query()
        .insert({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.DISCORD,
        })
        .onConflict(['contract_address', 'type'])
        .merge();

      // exercise.
      await context.call('collection.removeSocialLink', {
        contract_address: contractAddress,
        type: CollectionVerification.TYPES.DISCORD,
      });

      // verify.
      const collectionVerification = await CollectionVerification.query()
        .where({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.DISCORD,
        })
        .first();

      expect(collectionVerification).toBe(undefined);
    });

    it('Twitter: delete social link success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };

      await CollectionVerification.query()
        .insert({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.TWITTER,
        })
        .onConflict(['contract_address', 'type'])
        .merge();

      // exercise.
      await context.call('collection.removeSocialLink', {
        contract_address: contractAddress,
        type: CollectionVerification.TYPES.TWITTER,
      });

      // verify.
      const collectionVerification = await CollectionVerification.query()
        .where({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.TWITTER,
        })
        .first();

      expect(collectionVerification).toBe(undefined);
    });

    it('Telegram: delete social link success', async () => {
      // setup.
      const user = await User.query()
        .withGraphJoined('collections')
        .orderBy('users.id', 'asc')
        .whereNull(ref('collections.deleted_at'))
        .first();
      const contractAddress = user.collections[0].contract_address;
      context.meta = { user: { aura_address: user.aura_address } };

      await CollectionVerification.query()
        .insert({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.TELEGRAM,
        })
        .onConflict(['contract_address', 'type'])
        .merge();

      // exercise.
      await context.call('collection.removeSocialLink', {
        contract_address: contractAddress,
        type: CollectionVerification.TYPES.TELEGRAM,
      });

      // verify.
      const collectionVerification = await CollectionVerification.query()
        .where({
          contract_address: contractAddress,
          type: CollectionVerification.TYPES.TELEGRAM,
        })
        .first();

      expect(collectionVerification).toBe(undefined);
    });
  });
});
