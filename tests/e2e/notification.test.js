const mockMessaging = jest.fn(() =>
  ({
    send: () =>
      ({ catch: () => {} }),
    sendAll: () =>
      ({ catch: () => {} }),
    sendMulticast: () =>
      ({ catch: () => {} }),
  }));

jest.mock('firebase-admin', () => {
  return {
    messaging: mockMessaging,
  };
});

const NotificationServiceSchema = require('@services/notification.service');
const SyncBlockServiceSchema = require('@services/sync_block.service');
const MarketplaceServiceSchema = require('@services/marketplace.service');
const NftServiceSchema = require('@services/nft.service');

const { ServiceBroker, Context } = require('moleculer');

const chainConfig = require('@config/chain').defaultChain;
const {
  StandardContract,
  DeployedContract,
  SyncInformation,
  Nft,
  Store,
  User,
  Notification,
  UserNotification,
  UserDeviceToken,
} = require('@models');
const knex = require('@config/database');

const { setupBlockchainClient, sleep } = require('../helpers/test-utility');
const { offerNft, acceptOffer, approveNft } = require('../helpers/nft');
const { listNft, buyListing } = require('@helpers/listing');
const { EVENT, MESSAGE_TYPE } = require('@helpers/notifications/message_generator');

const { coins } = require('@cosmjs/proto-signing');

const _ = require('lodash');

describe('Test Notification', () => {
  let client;
  let wallet;
  let marketplace;
  let broker = new ServiceBroker({ logger: false });
  let context = new Context(broker, { logger: false });

  beforeAll(async () => {
    process.env.NO_USERS = 3;
    process.env.NO_COLLECTIONS = 1;
    process.env.NO_NFTS = 4;

    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '03_collections.js' });
    await knex.seed.run({ specific: '05_nfts.js' });
    await knex.seed.run({ specific: '09_marketplace.js' });

    marketplace = await Store.query().findOne({ subdomain: 'aura', status: Store.STATUSES.ACTIVE });
    const setup = await setupBlockchainClient(process.env.NO_USERS);
    client = setup.client;
    wallet = setup.wallet;

    broker.createService(NotificationServiceSchema);
    broker.createService(SyncBlockServiceSchema, { settings: { max_sync_block: 100 } });
    broker.createService(MarketplaceServiceSchema);
    broker.createService(NftServiceSchema);

    await broker.start();
  }, 150000);

  beforeEach(async () => {
    // skip sync previous block
    const latestBlock = await client.getBlock();
    await SyncInformation.query().where({ key: 'last-block-synced' }).patch({ height: latestBlock.header.height });

    await UserDeviceToken.query().delete();
    await UserNotification.query().delete();
  });

  afterAll(async () => {
    await broker.stop();
  });

  describe('Test notification', () => {
    it('Offer noti success', async () => {
      const nft = await Nft.query().withGraphFetched('owner').first();
      const owner = nft.owner;
      const offerer = await User.query().whereNot('aura_address', owner.aura_address).first();

      // assumed the nft has been uploaded to s3
      const s3Url = 'https://s3.url/';
      await nft.$query().patch({ metadata: { ...nft.metadata, s3_image: s3Url } });

      // add fcm token so firebase service can be called
      await UserDeviceToken.query()
        .insert([
          {
            user_id: owner.id,
            fcm_token: 'token',
          },
          {
            user_id: owner.id,
            fcm_token: 'token 2',
          },
        ])
        .onConflict()
        .ignore();

      // place offer
      const offerPrice = 1000;
      await offerNft(client, offerer, nft, marketplace, offerPrice);

      // execute.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const userNotification = await UserNotification.query()
        .where({
          user_id: owner.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification).not.toBeNull();

      const notification = await Notification.query().findById(userNotification.notification_id);
      notification.content = JSON.parse(notification.content);
      expect(notification).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Received an offer',
            body: `You have an offer of ${offerPrice / 1000000} AURA for ${nft.name}.`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.MAKE_OFFER,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (offerPrice / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      expect(mockMessaging).toHaveBeenCalled();
    }, 100000);

    it('Accept offer noti success', async () => {
      const nft = await Nft.query().withGraphFetched('owner').first().orderBy('id');
      const owner = nft.owner;
      const offerer = await User.query().whereNot('aura_address', owner.aura_address).first();

      // assumed the nft has been uploaded to s3
      const s3Url = 'https://s3.url/';
      await nft.$query().patch({ metadata: { ...nft.metadata, s3_image: s3Url } });

      // add fcm token so firebase service can be called
      await UserDeviceToken.query()
        .insert({
          user_id: owner.id,
          fcm_token: 'owner token',
        })
        .onConflict()
        .ignore();
      await UserDeviceToken.query()
        .insert({
          user_id: offerer.id,
          fcm_token: 'offerer token',
        })
        .onConflict()
        .ignore();

      // give bidding token to offerer
      const convertAmount = 1000000;
      let mintTokenMessage = {
        mint: {
          recipient: offerer.aura_address,
          amount: convertAmount.toString(),
        },
      };
      const twilightTokenContract = await StandardContract.query()
        .where({ name: StandardContract.TYPES.BIDDING_TOKEN, status: 'active' })
        .first();
      const deployedContract = await DeployedContract.query()
        .where({ standard_contract_id: twilightTokenContract.id })
        .orderBy('id', 'desc')
        .first();
      const tokenMinterAddress = (await wallet.getAccounts())[0].address;
      await client.execute(
        tokenMinterAddress,
        deployedContract.contract_address,
        mintTokenMessage,
        'auto',
        '',
        coins(convertAmount, chainConfig.denom),
      );

      // place & accept offer
      const offerPrice = 1000;
      await approveNft(client, nft, marketplace.contract_address);
      await offerNft(client, offerer, nft, marketplace, offerPrice);
      await acceptOffer(client, owner, offerer, nft, marketplace, offerPrice);

      // execute.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const userNotification1 = await UserNotification.query()
        .where({
          user_id: offerer.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification1).not.toBeNull();

      const userNotification2 = await UserNotification.query()
        .where({
          user_id: owner.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification2).not.toBeNull();

      const notification1 = await Notification.query().findById(userNotification1.notification_id);
      notification1.content = JSON.parse(notification1.content);
      expect(notification1).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Purchased an NFT',
            body: `Your offer on ${nft.name} for ${offerPrice / 1000000} AURA has been accepted.`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.ACCEPT_OFFER_BUYER,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (offerPrice / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });
      const notification2 = await Notification.query().findById(userNotification2.notification_id);
      notification2.content = JSON.parse(notification2.content);
      expect(notification2).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Sold an NFT',
            body: `You have sold ${nft.name} for ${offerPrice / 1000000} AURA.`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.ACCEPT_OFFER_SELLER,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (offerPrice / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      expect(mockMessaging).toHaveBeenCalled();
    }, 100000);

    it('First time listing success', async () => {
      // setup.
      const nft = (await Nft.query().withGraphFetched('[owner, listing]')).filter((candidateNft) =>
        _.isEmpty(candidateNft.listing))[0];
      expect(_.isEmpty(nft.listing)).toBeTruthy();

      const s3Url = 'https://s3.url/';

      const owner = nft.owner;
      const offerers = await User.query().whereNot('aura_address', owner.aura_address).limit(2);
      const offerer1 = offerers[0];
      const offerer2 = offerers[1];

      // pretend the nft has been uploaded to s3
      await nft.$query().patch({ metadata: { ...nft.metadata, s3_image: s3Url } });

      // add fcm token so firebase service can be called
      await UserDeviceToken.query()
        .insert({
          user_id: offerer1.id,
          fcm_token: 'token1',
        })
        .onConflict()
        .ignore();
      await UserDeviceToken.query()
        .insert({
          user_id: offerer2.id,
          fcm_token: 'token2',
        })
        .onConflict()
        .ignore();

      // place 2 offers from 2 users.
      await offerNft(client, offerer1, nft, marketplace, 1000);
      await offerNft(client, offerer2, nft, marketplace, 2000);

      // first time listing
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: '10000',
            denom: chainConfig.denom,
          },
        },
      };
      await listNft(client, owner, nft, marketplace, auctionConfig);

      // execute.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const userNotification1 = await UserNotification.query()
        .where({
          user_id: offerer1.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification1).not.toBeNull();

      const userNotification2 = await UserNotification.query()
        .where({
          user_id: offerer2.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification2).not.toBeNull();
      expect(userNotification1.notification_id).toBe(userNotification2.notification_id);

      const notification = await Notification.query().findById(userNotification1.notification_id);
      notification.content = JSON.parse(notification.content);
      expect(notification).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Price change',
            body: `${nft.name} is listed for ${auctionConfig.fixed_price.price.amount / 1000000} AURA`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.CHANGE_PRICE,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (auctionConfig.fixed_price.price.amount / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      expect(mockMessaging).toHaveBeenCalled();
    }, 100000);

    it('First time listing success, no offerer', async () => {
      // setup.
      const nft = (await Nft.query().withGraphFetched('[owner, listing, offerers]')).filter(
        (candidateNft) =>
          _.isEmpty(candidateNft.listing) && _.isEmpty(candidateNft.offerers),
      )[0];

      const s3Url = 'https://s3.url/';

      const owner = nft.owner;

      // pretend the nft has been uploaded to s3
      await nft.$query().patch({ metadata: { ...nft.metadata, s3_image: s3Url } });

      // first time listing
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: '10000',
            denom: chainConfig.denom,
          },
        },
      };
      await listNft(client, owner, nft, marketplace, auctionConfig);

      await Notification.query().delete();
      // execute.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const notifications = await Notification.query();
      expect(notifications.length).toBe(0);
    }, 100000);

    it('Change price noti success', async () => {
      // setup.
      const nft = await Nft.query().withGraphFetched('owner').first().orderBy('id')
        .offset(2);
      const s3Url = 'https://s3.url/';

      const owner = nft.owner;
      const offerers = await User.query().whereNot('aura_address', owner.aura_address).limit(2);
      const offerer1 = offerers[0];
      const offerer2 = offerers[1];

      // pretend the nft has been uploaded to s3
      await nft.$query().patch({ metadata: { ...nft.metadata, s3_image: s3Url } });

      // add fcm token so firebase service can be called
      await UserDeviceToken.query()
        .insert({
          user_id: offerer1.id,
          fcm_token: 'token1',
        })
        .onConflict()
        .ignore();
      await UserDeviceToken.query()
        .insert({
          user_id: offerer2.id,
          fcm_token: 'token2',
        })
        .onConflict()
        .ignore();

      // place 2 offers from 2 users.
      await offerNft(client, offerer1, nft, marketplace, 1000);
      await offerNft(client, offerer2, nft, marketplace, 2000);

      // owner list nft then change price
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: '10000',
            denom: chainConfig.denom,
          },
        },
      };
      await listNft(client, owner, nft, marketplace, auctionConfig);
      auctionConfig.fixed_price.price.amount = '20000';
      await listNft(client, owner, nft, marketplace, auctionConfig);

      // execute.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const userNotification1 = await UserNotification.query()
        .where({
          user_id: offerer1.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification1).not.toBeNull();

      const userNotification2 = await UserNotification.query()
        .where({
          user_id: offerer2.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification2).not.toBeNull();
      expect(userNotification1.notification_id).toBe(userNotification2.notification_id);

      const notification = await Notification.query().findById(userNotification1.notification_id);
      notification.content = JSON.parse(notification.content);
      expect(notification).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Price change',
            body: `${nft.name} is listed for ${auctionConfig.fixed_price.price.amount / 1000000} AURA`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.CHANGE_PRICE,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (auctionConfig.fixed_price.price.amount / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      expect(mockMessaging).toHaveBeenCalled();
    }, 100000);

    it('Buy noti success', async () => {
      // setup.
      const nft = await Nft.query().withGraphFetched('owner').first();
      const s3Url = 'https://s3.url/';

      const owner = nft.owner;
      const buyer = await User.query().whereNot('aura_address', owner.aura_address).first();

      // pretend the nft has been uploaded to s3
      await nft.$query().patch({ metadata: { ...nft.metadata, s3_image: s3Url } });

      // add fcm token so firebase service can be called
      await UserDeviceToken.query()
        .insert({
          user_id: owner.id,
          fcm_token: 'token1',
        })
        .onConflict()
        .ignore();
      await UserDeviceToken.query()
        .insert({
          user_id: buyer.id,
          fcm_token: 'token2',
        })
        .onConflict()
        .ignore();

      // owner list nft then change price
      const price = 10000;
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: price.toString(),
            denom: chainConfig.denom,
          },
        },
      };
      await listNft(client, owner, nft, marketplace, auctionConfig);
      const listing = {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        store_address: marketplace.contract_address,
        auction_config: { config: auctionConfig },
      };
      await buyListing(client, buyer, listing);

      // execute.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const userNotification1 = await UserNotification.query()
        .where({
          user_id: buyer.id,
        })
        .orderBy('id', 'desc')
        .first(0);
      expect(userNotification1).not.toBeNull();

      const userNotification2 = await UserNotification.query()
        .where({
          user_id: owner.id,
        })
        .orderBy('id', 'desc')
        .first(0);
      expect(userNotification2).not.toBeNull();

      const notification1 = await Notification.query().findById(userNotification1.notification_id);
      notification1.content = JSON.parse(notification1.content);
      expect(notification1).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Purchased an NFT',
            body: `You have purchased ${nft.name} for ${price / 1000000} AURA.`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.BUY_BUYER,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (price / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      const notification2 = await Notification.query().findById(userNotification2.notification_id);
      notification2.content = JSON.parse(notification2.content);
      expect(notification2).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Sold an NFT',
            body: `You have sold ${nft.name} for ${price / 1000000} AURA.`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.BUY_SELLER,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (price / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      expect(mockMessaging).toHaveBeenCalled();
    }, 100000);
  });

  describe('Test notification APIs', () => {
    it('register fcm token success', async () => {
      // setup.
      const user = await User.query().first();
      const fcmToken = 'fcmtoken';

      // execute.
      context.meta.user = user;
      await context.call('notification.registerFcmToken', { fcm_token: fcmToken });

      // verify.
      const userDeviceToken = await UserDeviceToken.query().where({ user_id: user.id, fcm_token: fcmToken });
      expect(userDeviceToken.length).toBe(1);
    });

    it('register fcm token 2 times success', async () => {
      // setup.
      const user = await User.query().first();
      const fcmToken = 'fcmtoken';

      // execute.
      context.meta.user = user;
      await context.call('notification.registerFcmToken', { fcm_token: fcmToken });
      await context.call('notification.registerFcmToken', { fcm_token: fcmToken });

      // verify.
      const userDeviceToken = await UserDeviceToken.query().where({ user_id: user.id, fcm_token: fcmToken });
      expect(userDeviceToken.length).toBe(1);
    });
  });
});
