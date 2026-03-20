'use strict';

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

const { ServiceBroker } = require('moleculer');
const AuctionServiceSchema = require('@services/auction.service');
const SyncBlockServiceSchema = require('@services/sync_block.service');
const NftServiceSchema = require('@services/nft.service');
const marketplaceServiceSchema = require('@services/marketplace.service');
const NotificationServiceSchema = require('@services/notification.service');

const knex = require('@config/database');
const {
  Store,
  SyncTx,
  SyncInformation,
  Nft,
  NftHistory,
  Listing,
  AuctionHistory,
  User,
  UserNotification,
  Notification,
} = require('@models');
const { setupBlockchainClient, sleep, getRoundedDateForTesting } = require('../helpers/test-utility');
const chainConfig = require('@config/chain').defaultChain;

const { approveNft } = require('../helpers/nft');
const { createAuction, createBid, settleAuction } = require('../helpers/auction');
const { makeOffer } = require('../helpers/offer');
const { EVENT, MESSAGE_TYPE } = require('@helpers/notifications/message_generator');

const { coin } = require('@cosmjs/proto-signing');
const dayjs = require('dayjs');
const _ = require('lodash');

const axios = require('axios').default;
jest.spyOn(axios, 'post');
const { createSuccessResponse } = require('../factories/horoscope/cw721_activities_response');

describe('Test auction', () => {
  let broker = new ServiceBroker({ logger: false });
  const nftService = broker.createService(NftServiceSchema);
  broker.createService(NotificationServiceSchema);
  broker.createService(AuctionServiceSchema);
  broker.createService(marketplaceServiceSchema);
  broker.createService(SyncBlockServiceSchema, { settings: { max_sync_block: 100 } });

  let client;
  let auction;
  let nfts;
  let users;
  let marketplace;

  beforeAll(async () => {
    process.env.NO_USERS = 3;
    process.env.NO_COLLECTIONS = 2;
    process.env.NO_NFTS = 4;

    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '03_collections.js' });
    await knex.seed.run({ specific: '05_nfts.js' });
    await knex.seed.run({ specific: '06_auction_contracts.js' });
    await knex.seed.run({ specific: '09_marketplace.js' });

    const setup = await setupBlockchainClient(process.env.NO_USERS);
    client = setup.client;
    auction = await Store.query().findOne({ subdomain: 'aura-auction', status: Store.STATUSES.ACTIVE });
    marketplace = await Store.query().findOne({ subdomain: 'aura', status: Store.STATUSES.ACTIVE });

    nfts = await Nft.query();
    users = await User.query().limit(3);
    // add fcm token so firebase service can be called
    await knex('user_device_tokens')
      .insert(users.map((user) =>
        ({ user_id: user.id, fcm_token: `token${user.id}` })))
      .onConflict()
      .ignore();

    await broker.start();
  }, 200000);

  beforeEach(async () => {
    // skip sync previous block
    const latestBlock = await client.getBlock();
    await SyncInformation.query().where({ key: 'last-block-synced' }).patch({ height: latestBlock.header.height });
  });

  afterAll(async () => {
    await broker.stop();
    await knex.destroy();
  });

  describe('Test sync auction', () => {
    it('Create auction success, auction config with all fields & price change notification', async () => {
      // setup
      const nft = nfts[0];
      const offerers = users.filter((user) =>
        user.aura_address !== nft.owner_address);

      // for test notification
      const s3Url = 'https://s3.url/';
      // pretend the nft has been uploaded to s3
      await nft.$query().patch({ metadata: { ...nft.metadata, s3_image: s3Url } });

      await makeOffer(client, offerers[0], marketplace, nft);
      await makeOffer(client, offerers[1], marketplace, nft);

      const approveAuctionMsg = {
        approve: {
          spender: auction.contract_address,
          token_id: nft.token_id,
          expires: {
            never: {},
          },
        },
      };
      await client.execute(nft.owner_address, nft.contract_address, approveAuctionMsg, 'auto');

      const startTime = dayjs().add(100, 'second').valueOf().toString() + '000000';
      const endTime = dayjs().add(300, 'second').valueOf().toString() + '000000';
      const startPrice = 1000;
      const createAuctionMessage = {
        auction_nft: {
          nft: {
            contract_address: nft.contract_address,
            token_id: nft.token_id,
          },
          auction_config: {
            english_auction: {
              start_price: coin(startPrice, chainConfig.denom),
              step_percentage: 5,
              buyout_price: '12000',
              start_time: {
                at_time: startTime,
              },
              end_time: {
                at_time: endTime,
              },
            },
          },
        },
      };
      const response = await client.execute(nft.owner_address, auction.contract_address, createAuctionMessage, 'auto');

      // execute.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');
      await sleep(2000);

      // fake horoscope transfer activities
      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post.mockImplementation(() =>
        createSuccessResponse([
          {
            id: parseInt(syncInformation.query, 10) + 1,
            action: 'transfer_nft',
            from: nft.owner_address,
            to: auction.contract_address,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            height: 111,
            hash: 'hash',
          },
        ]));
      await nftService.syncNfts();
      await sleep(2000);

      // verify.
      const tx = await client.getTx(response.transactionHash);
      const block = await client.getBlock(tx.height);
      const syncedTx = await SyncTx.query().where({ hash: response.transactionHash }).first();
      expect(syncedTx).toMatchObject({
        hash: response.transactionHash,
        height: block.header.height,
        msg_index: 0,
        block_time: getRoundedDateForTesting(block.header.time),
        raw_data: expect.any(String),
      });

      // verify listing created / updated
      const listing = await Listing.query().findOne({
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        store_address: auction.contract_address,
      });
      expect(listing).toMatchObject({
        status: Listing.STATUSES.ONGOING,
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: auction.contract_address,
        seller_address: nft.owner_address,
        buyer_address: null,
        auction_config: { config: createAuctionMessage.auction_nft.auction_config },
        latest_price: startPrice.toString(),
        start_time: expect.any(Date),
        end_time: expect.any(Date),
        type: Listing.TYPE.ENGLISH_AUCTION,
      });

      // verify nft transfered
      const nftAfterCreate = await Nft.query().findById(nft.id);
      expect(nftAfterCreate).toMatchObject({
        ...nft,
        last_listing_id: listing.id,
        owner_address: auction.contract_address,
        updated_at: expect.any(Date),
      });

      const nftHistory1 = await NftHistory.query()
        .where({ contract_address: nft.contract_address, token_id: nft.token_id, event: NftHistory.EVENTS.LIST })
        .orderBy('id', 'desc')
        .first();
      expect(nftHistory1).toMatchObject({
        transaction_hash: response.transactionHash,
        from_address: nft.owner_address,
        to_address: null,
        event: NftHistory.EVENTS.LIST,
        token_id: nft.token_id,
        transaction_time: getRoundedDateForTesting(block.header.time),
        contract_address: nft.contract_address,
        price: { amount: listing.latest_price },
        additional_information: null,
        block_height: tx.height,
        sync_tx_id: syncedTx.id,
      });

      // verify transfer history
      const nftHistory2 = await NftHistory.query()
        .where({ contract_address: nft.contract_address, token_id: nft.token_id, event: NftHistory.EVENTS.TRANSFER })
        .orderBy('id', 'desc')
        .first();
      expect(nftHistory2).toMatchObject({
        transaction_hash: 'hash',
        from_address: nft.owner_address,
        to_address: auction.contract_address,
        event: NftHistory.EVENTS.TRANSFER,
        token_id: nft.token_id,
        transaction_time: expect.any(Date),
        contract_address: nft.contract_address,
        price: null,
        additional_information: null,
        block_height: 111,
      });

      const auctionHistory = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.CREATE,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(auctionHistory).toMatchObject({
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        auction_address: auction.contract_address,
        seller_address: nft.owner_address,
        config: listing.auction_config,
        bidder_address: null,
        bidding_price: null,
        auction_create_id: null,
      });

      // notifications are sent to all offerers
      // verify.
      const userNotification1 = await UserNotification.query()
        .where({
          user_id: offerers[0].id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification1).not.toBeNull();

      const userNotification2 = await UserNotification.query()
        .where({
          user_id: offerers[1].id,
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
            body: `${nft.name} is listed for ${startPrice / 1000000} AURA`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.CHANGE_PRICE,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (startPrice / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      expect(mockMessaging).toHaveBeenCalled();
    }, 100000);

    it('Create auction success, auction config with default fields', async () => {
      // setup
      const nft = nfts[1];

      const approveAuctionMsg = {
        approve: {
          spender: auction.contract_address,
          token_id: nft.token_id,
          expires: {
            never: {},
          },
        },
      };
      await client.execute(nft.owner_address, nft.contract_address, approveAuctionMsg, 'auto');

      const endTime = dayjs().add(300, 'second').valueOf().toString() + '000000';
      const startPrice = 1000;
      const createAuctionMessage = {
        auction_nft: {
          nft: {
            contract_address: nft.contract_address,
            token_id: nft.token_id,
          },
          auction_config: {
            english_auction: {
              start_price: coin(startPrice, chainConfig.denom),
              end_time: {
                at_time: endTime,
              },
            },
          },
        },
      };
      const response = await client.execute(nft.owner_address, auction.contract_address, createAuctionMessage, 'auto');

      // execute.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // fake horoscope transfer activities
      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post.mockImplementation(() =>
        createSuccessResponse([
          {
            id: parseInt(syncInformation.query, 10) + 1,
            action: 'transfer_nft',
            from: nft.owner_address,
            to: auction.contract_address,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            height: 111,
            hash: 'hash',
          },
        ]));
      await nftService.syncNfts();
      await sleep(2000);

      // verify.
      const tx = await client.getTx(response.transactionHash);
      const block = await client.getBlock(tx.height);
      const syncedTx = await SyncTx.query().where({ hash: response.transactionHash }).first();
      expect(syncedTx).toMatchObject({
        hash: response.transactionHash,
        height: block.header.height,
        msg_index: 0,
        block_time: getRoundedDateForTesting(block.header.time),
        raw_data: expect.any(String),
      });

      // verify listing created / updated
      const listing = await Listing.query().findOne({
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        store_address: auction.contract_address,
      });
      expect(listing).toMatchObject({
        status: Listing.STATUSES.ONGOING,
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: auction.contract_address,
        seller_address: nft.owner_address,
        buyer_address: null,
        auction_config: { config: createAuctionMessage.auction_nft.auction_config },
        latest_price: startPrice.toString(),
        start_time: expect.any(Date),
        end_time: expect.any(Date),
        type: Listing.TYPE.ENGLISH_AUCTION,
      });

      // verify nft transfered
      const nftAfterCreate = await Nft.query().findById(nft.id);
      expect(nftAfterCreate).toMatchObject({
        ...nft,
        last_listing_id: listing.id,
        owner_address: auction.contract_address,
        updated_at: expect.any(Date),
      });

      const nftHistory1 = await NftHistory.query()
        .where({ contract_address: nft.contract_address, token_id: nft.token_id, event: NftHistory.EVENTS.LIST })
        .orderBy('id', 'desc')
        .first();
      expect(nftHistory1).toMatchObject({
        transaction_hash: response.transactionHash,
        from_address: nft.owner_address,
        to_address: null,
        event: NftHistory.EVENTS.LIST,
        token_id: nft.token_id,
        transaction_time: getRoundedDateForTesting(block.header.time),
        contract_address: nft.contract_address,
        price: { amount: listing.latest_price },
        additional_information: null,
        block_height: tx.height,
        sync_tx_id: syncedTx.id,
      });

      // verify transfer history
      const nftHistory2 = await NftHistory.query()
        .where({ contract_address: nft.contract_address, token_id: nft.token_id, event: NftHistory.EVENTS.TRANSFER })
        .orderBy('id', 'desc')
        .first();
      expect(nftHistory2).toMatchObject({
        transaction_hash: 'hash',
        from_address: nft.owner_address,
        to_address: auction.contract_address,
        event: NftHistory.EVENTS.TRANSFER,
        token_id: nft.token_id,
        transaction_time: expect.any(Date),
        contract_address: nft.contract_address,
        price: null,
        additional_information: null,
        block_height: 111,
      });

      const auctionHistory = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.CREATE,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(auctionHistory).toMatchObject({
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        auction_address: auction.contract_address,
        seller_address: nft.owner_address,
        config: listing.auction_config,
        bidder_address: null,
        bidding_price: null,
        auction_create_id: null,
      });
    }, 100000);
  });

  describe('Test sync auction', () => {
    it('Bid auction success, end time unchange & owner receives bid noti & early bidder receives refund noti', async () => {
      // setup
      const nft = nfts[2];

      // for test notification
      const s3Url = 'https://s3.url/';
      // pretend the nft has been uploaded to s3
      await nft.$query().patch({ metadata: { ...nft.metadata, s3_image: s3Url } });

      const owner = users.find((user) =>
        user.aura_address === nft.owner_address);
      const bidders = users.filter((user) =>
        user.aura_address !== nft.owner_address);
      const bidPrices = [1200, 2400];
      const endTime = dayjs().add(100, 'minutes').valueOf().toString() + '000000';

      await approveNft(client, nft, auction.contract_address);
      await createAuction(client, auction, nft, null, endTime);
      // execution: sync create auction.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');

      const listingBeforeBid = await Listing.query().findOne({
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        store_address: auction.contract_address,
      });
      const createAuctionHistoryBeforeBid = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.CREATE,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();

      const createBidResponse1 = await createBid(client, auction, nft, bidders[0].aura_address, bidPrices[0]);

      // execution: sync create bid.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const tx = await client.getTx(createBidResponse1.transactionHash);
      const block = await client.getBlock(tx.height);
      const syncedTx = await SyncTx.query().where({ hash: createBidResponse1.transactionHash }).first();
      expect(syncedTx).toMatchObject({
        hash: createBidResponse1.transactionHash,
        height: block.header.height,
        msg_index: 0,
        block_time: getRoundedDateForTesting(block.header.time),
        raw_data: expect.any(String),
      });

      // verify end timestamps in listing and create auction histories are not updated
      const listingAfterBid = await Listing.query().findById(listingBeforeBid.id);
      expect(listingAfterBid).toMatchObject(listingBeforeBid);
      const createAuctionHistoryAfterBid = await AuctionHistory.query().findById(createAuctionHistoryBeforeBid.id);
      expect(createAuctionHistoryAfterBid).toMatchObject(createAuctionHistoryBeforeBid);

      // verify bid history is added
      const bidAuctionHistory1 = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.BID,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(bidAuctionHistory1).toMatchObject({
        auction_event: AuctionHistory.EVENTS.BID,
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        auction_address: auction.contract_address,
        seller_address: null,
        config: null,
        bidder_address: bidders[0].aura_address,
        bidding_price: bidPrices[0].toString(),
        auction_create_id: createAuctionHistoryBeforeBid.id,
      });

      // verify nft history added
      const nftHistory = await NftHistory.query()
        .findOne({
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          event: NftHistory.EVENTS.PLACE_BID,
        })
        .orderBy('id', 'desc');
      expect(nftHistory).toMatchObject({
        transaction_hash: createBidResponse1.transactionHash,
        event: NftHistory.EVENTS.PLACE_BID,
        from_address: bidders[0].aura_address,
        to_address: auction.contract_address,
        token_id: nft.token_id,
        transaction_time: new Date(block.header.time),
        contract_address: nft.contract_address,
        block_height: createBidResponse1.height,
        sync_tx_id: syncedTx.id,
        price: { amount: bidPrices[0].toString() },
      });

      // verify owner receives biding noti
      const userNotification1 = await UserNotification.query()
        .where({
          user_id: owner.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification1).not.toBeNull();

      const notification1 = await Notification.query().findById(userNotification1.notification_id);
      notification1.content = JSON.parse(notification1.content);
      expect(notification1).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Received a bid',
            body: `You have a bid of ${bidPrices[0] / 1000000} AURA for ${nft.name}.`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.RECEIVED_BID,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (bidPrices[0] / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      // place second bid,
      const createBidResponse2 = await createBid(client, auction, nft, bidders[1].aura_address, bidPrices[1]);

      // execution: sync create bid.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');

      // verify bid history is added
      const bidAuctionHistory2 = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.BID,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(bidAuctionHistory2).toMatchObject({
        auction_event: AuctionHistory.EVENTS.BID,
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        auction_address: auction.contract_address,
        seller_address: null,
        config: null,
        bidder_address: bidders[1].aura_address,
        bidding_price: bidPrices[1].toString(),
        auction_create_id: createAuctionHistoryBeforeBid.id,
      });

      const nftHistory2 = await NftHistory.query()
        .findOne({
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          event: NftHistory.EVENTS.PLACE_BID,
        })
        .orderBy('id', 'desc');
      expect(nftHistory2).toMatchObject({
        transaction_hash: createBidResponse2.transactionHash,
        event: NftHistory.EVENTS.PLACE_BID,
        from_address: bidders[1].aura_address,
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        block_height: createBidResponse2.height,
        price: { amount: bidPrices[1].toString() },
      });

      // verify owner receives biding noti
      const userNotification2 = await UserNotification.query()
        .where({
          user_id: owner.id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification2).not.toBeNull();

      const notification2 = await Notification.query().findById(userNotification2.notification_id);
      notification2.content = JSON.parse(notification2.content);
      expect(notification2).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Received a bid',
            body: `You have a bid of ${bidPrices[1] / 1000000} AURA for ${nft.name}.`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.RECEIVED_BID,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (bidPrices[1] / 1000000).toString(),
            time: expect.any(String),
          },
        },
      });

      const userNotification3 = await UserNotification.query()
        .where({
          user_id: bidders[0].id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(userNotification3).not.toBeNull();

      const notification3 = await Notification.query().findById(userNotification3.notification_id);
      notification3.content = JSON.parse(notification3.content);
      expect(notification3).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Outbid and Refund',
            body: `A higher bid than yours has just been placed on ${nft.name} and you have been refunded ${
              bidPrices[0] / 1000000
            } AURA.`,
            imageUrl: s3Url,
          },
          data: {
            type: MESSAGE_TYPE.OUTBID_REFUND,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            nft_name: nft.name,
            nft_price: (bidPrices[0] / 1000000).toString(),
            time: expect.any(String),
            transaction_hash: createBidResponse2.transactionHash,
          },
        },
      });

      expect(mockMessaging).toHaveBeenCalledTimes(3);
    }, 100000);

    it('Bid auction success, end time changed', async () => {
      // setup
      const nft = nfts[3];
      const bidderAddress = users.filter((user) =>
        user.aura_address !== nft.owner_address)[0].aura_address;
      const endTime = dayjs().add(5, 'minutes').valueOf().toString() + '000000';

      await approveNft(client, nft, auction.contract_address);
      await createAuction(client, auction, nft, null, endTime);
      // execution: sync create auction.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');

      const listingBeforeBid = await Listing.query().findOne({
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        store_address: auction.contract_address,
      });
      const createAuctionHistoryBeforeBid = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.CREATE,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();

      const createBidResponse = await createBid(client, auction, nft, bidderAddress, 1200);
      await createBid(client, auction, nft, bidderAddress, 2400);

      // execution: sync create bid.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const tx = await client.getTx(createBidResponse.transactionHash);
      const block = await client.getBlock(tx.height);
      const syncedTx = await SyncTx.query().where({ hash: createBidResponse.transactionHash }).first();
      expect(syncedTx).toMatchObject({
        hash: createBidResponse.transactionHash,
        height: block.header.height,
        msg_index: 0,
        block_time: getRoundedDateForTesting(block.header.time),
        raw_data: expect.any(String),
      });

      // verify end timestamps in listing and create auction histories are updated
      const listingAfterBid = await Listing.query().findById(listingBeforeBid.id);
      expect(listingAfterBid.end_time.toString()).not.toBe(listingBeforeBid.end_time.toString());
      expect(listingAfterBid.auction_config.config.english_auction.end_time).not.toBe(
        listingBeforeBid.auction_config.config.english_auction.end_time,
      );

      const createAuctionHistoryAfterBid = await AuctionHistory.query().findById(createAuctionHistoryBeforeBid.id);
      expect(createAuctionHistoryAfterBid.config).toMatchObject(listingAfterBid.auction_config);

      // verify except from end_time, other fields in listings.auction_config unchanged
      delete listingBeforeBid.auction_config.config.english_auction.end_time;
      delete listingAfterBid.auction_config.config.english_auction.end_time;
      expect(listingAfterBid.auction_config).toMatchObject(listingBeforeBid.auction_config);

      // verify bid history is added
      const bidAuctionHistory = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.BID,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(bidAuctionHistory).toMatchObject({
        auction_event: AuctionHistory.EVENTS.BID,
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        auction_address: auction.contract_address,
        seller_address: null,
        config: null,
        bidder_address: bidderAddress,
        bidding_price: '2400',
        auction_create_id: createAuctionHistoryBeforeBid.id,
      });
    }, 100000);
  });

  describe('Test sync auction settlement', () => {
    // this test doesn't work because of faking bid event
    it.skip('Settle success, 1 bidder, seller settle auction', async () => {
      // setup
      const nft = nfts[4];
      const bidders = users.filter((user) =>
        user.aura_address !== nft.owner_address);

      await approveNft(client, nft, auction.contract_address);

      const startTime = dayjs().add(4, 'second').valueOf().toString() + '000000';
      const endTime = dayjs().add(5, 'second').valueOf().toString() + '000000';
      const createAuctionResponse = await createAuction(client, auction, nft, startTime, endTime);

      // execution: sync settle auction.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');

      // Fake bidding data
      // Because bid near the end of auction extends auction period by 10 mins,
      // which is too long to wait in test
      const createAuctionHistory = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.CREATE,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(_.isEmpty(createAuctionHistory)).toBeFalsy();
      await AuctionHistory.query().insertGraph([
        {
          auction_event: AuctionHistory.EVENTS.BID,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
          bidder_address: bidders[0].aura_address,
          bidding_price: 1200,
          auction_create_id: createAuctionHistory.id,
        },
        {
          auction_event: AuctionHistory.EVENTS.BID,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
          bidder_address: bidders[1].aura_address,
          bidding_price: 1300,
          auction_create_id: createAuctionHistory.id,
        },
      ]);

      await sleep(3000); // waiting for auction expiration
      const settleAuctionResponse = await settleAuction(client, auction, nft, nft.owner_address);

      // execution: sync settle auction.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // verify.
      const tx = await client.getTx(settleAuctionResponse.transactionHash);
      const block = await client.getBlock(tx.height);
      const syncedTx = await SyncTx.query().where({ hash: settleAuctionResponse.transactionHash }).first();
      expect(syncedTx).toMatchObject({
        hash: settleAuctionResponse.transactionHash,
        height: block.header.height,
        msg_index: 0,
        block_time: getRoundedDateForTesting(block.header.time),
        raw_data: expect.any(String),
      });

      // verify listing succeeded
      const listing = await Listing.query().findOne({
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: auction.contract_address,
      });
      expect(listing).toMatchObject({
        status: Listing.STATUSES.SUCCEEDED,
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: auction.contract_address,
        seller_address: nft.owner_address,
        buyer_address: bidders[1].aura_address,
        auction_config: { config: { english_auction: createAuctionResponse.english_auction } },
        latest_price: '1300',
        start_time: expect.any(Date),
        end_time: expect.any(Date),
        type: Listing.TYPE.ENGLISH_AUCTION,
      });

      // verify nft transfered
      const nftAfterSettle = await Nft.query().findById(nft.id);
      expect(nftAfterSettle).toMatchObject({
        ...nft,
        owner_address: expect.any(String), // unchanged because bidding is fake
        sync_tx_id: syncedTx.id,
        updated_at: expect.any(Date),
      });

      // verify settle history is added
      const settleAuctionHistory = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.SETTLE,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(settleAuctionHistory).toMatchObject({
        auction_event: AuctionHistory.EVENTS.SETTLE,
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        auction_address: auction.contract_address,
        seller_address: null,
        config: null,
        bidder_address: null,
        bidding_price: null,
        settler_address: nft.owner_address,
        auction_create_id: createAuctionHistory.id,
      });

      // verify buy history created
      const nftHistory1 = await NftHistory.query()
        .findOne({
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          event: NftHistory.EVENTS.BUY,
        })
        .orderBy('id', 'desc');
      expect(nftHistory1).toMatchObject({
        transaction_hash: settleAuctionResponse.transactionHash,
        from_address: auction.contract_address,
        to_address: bidders[1].aura_address,
        token_id: nft.token_id,
        transaction_time: new Date(block.header.time),
        contract_address: nft.contract_address,
        price: { amount: '1300' },
        block_height: tx.height,
        additional_information: null,
        event: NftHistory.EVENTS.BUY,
        sync_tx_id: syncedTx.id,
      });

      // verify transfer history created
      const nftHistory2 = await NftHistory.query()
        .findOne({
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          event: NftHistory.EVENTS.TRANSFER,
        })
        .orderBy('id', 'desc');
      expect(nftHistory2).toMatchObject({
        transaction_hash: settleAuctionResponse.transactionHash,
        from_address: auction.contract_address,
        to_address: expect.any(String), // unchanged because bidding is fake
        token_id: nft.token_id,
        transaction_time: new Date(block.header.time),
        contract_address: nft.contract_address,
        price: null,
        block_height: tx.height,
        additional_information: null,
        event: NftHistory.EVENTS.TRANSFER,
        sync_tx_id: syncedTx.id,
      });
    }, 150000);

    it('Settle success, 0 bidder', async () => {
      // setup
      const nft = nfts[5];

      await approveNft(client, nft, auction.contract_address);

      const startTime = dayjs().add(8, 'second').valueOf().toString() + '000000';
      const endTime = dayjs().add(9, 'second').valueOf().toString() + '000000';
      const createAuctionResponse = await createAuction(client, auction, nft, startTime, endTime);

      await sleep(9000); // waiting for auction expiration
      const settleAuctionResponse = await settleAuction(client, auction, nft, nft.owner_address);

      // execution: sync settle auction.
      await sleep(2000);
      await broker.call('sync-block.syncBlock');

      // fake horoscope transfer activities
      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post.mockImplementation(() =>
        createSuccessResponse([
          {
            id: parseInt(syncInformation.query, 10) + 1,
            action: 'transfer_nft',
            from: nft.owner_address,
            to: auction.contract_address,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            height: 111,
            hash: 'hash',
          },
          {
            id: parseInt(syncInformation.query, 10) + 2,
            action: 'transfer_nft',
            from: auction.contract_address,
            to: nft.owner_address,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            height: 112,
            hash: 'hash',
          },
        ]));
      await nftService.syncNfts();

      // verify.
      const tx = await client.getTx(settleAuctionResponse.transactionHash);
      const block = await client.getBlock(tx.height);
      const syncedTx = await SyncTx.query().where({ hash: settleAuctionResponse.transactionHash }).first();
      expect(syncedTx).toMatchObject({
        hash: settleAuctionResponse.transactionHash,
        height: block.header.height,
        msg_index: 0,
        block_time: getRoundedDateForTesting(block.header.time),
        raw_data: expect.any(String),
      });

      // verify listing cancelled
      const listing = await Listing.query().findOne({
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: auction.contract_address,
      });
      expect(listing).toMatchObject({
        status: Listing.STATUSES.CANCELLED,
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: auction.contract_address,
        seller_address: nft.owner_address,
        buyer_address: null,
        auction_config: { config: { english_auction: createAuctionResponse.english_auction } },
        latest_price: expect.any(String),
        start_time: expect.any(Date),
        end_time: expect.any(Date),
        type: Listing.TYPE.ENGLISH_AUCTION,
      });

      // verify nft transfered back to owner
      const nftAfterSettle = await Nft.query().findById(nft.id);
      expect(nftAfterSettle).toMatchObject({
        ...nft,
        last_listing_id: listing.id,
        owner_address: nft.owner_address,
        updated_at: expect.any(Date),
      });

      // verify settle history is added
      const createAuctionHistory = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.CREATE,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      const settleAuctionHistory = await AuctionHistory.query()
        .where({
          auction_event: AuctionHistory.EVENTS.SETTLE,
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_address: auction.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(settleAuctionHistory).toMatchObject({
        auction_event: AuctionHistory.EVENTS.SETTLE,
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        auction_address: auction.contract_address,
        seller_address: null,
        config: null,
        bidder_address: null,
        bidding_price: null,
        settler_address: nft.owner_address,
        auction_create_id: createAuctionHistory.id,
      });

      // verify didn't create buy-history
      const nftHistory1 = await NftHistory.query()
        .findOne({
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          event: NftHistory.EVENTS.BUY,
        })
        .orderBy('id', 'desc');
      expect(_.isEmpty(nftHistory1)).toBeTruthy();

      // verify transfer history created
      const nftHistory2 = await NftHistory.query()
        .findOne({
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          event: NftHistory.EVENTS.TRANSFER,
        })
        .orderBy('id', 'desc');
      expect(nftHistory2).toMatchObject({
        transaction_hash: 'hash',
        from_address: auction.contract_address,
        to_address: nft.owner_address,
        token_id: nft.token_id,
        transaction_time: expect.any(Date),
        contract_address: nft.contract_address,
        price: null,
        block_height: 112,
        additional_information: null,
        event: NftHistory.EVENTS.TRANSFER,
      });
    }, 150000);
  });
});
