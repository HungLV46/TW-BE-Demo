'user strict';

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

const NotificationServiceSchema = require('@services/notification.service');
const ListingServiceSchema = require('@services/sync_listing.service');
const {
  Listing, AuctionHistory, User, UserNotification, Notification, SyncTx
} = require('@models');
const knex = require('@config/database');

const AuctionHistoryFactory = require('../factories/auction_history');
const NftFactory = require('../factories/nft');
const ListingFactory = require('../factories/listing');
const SyncTxFactory = require('../factories/sync_tx');
const CollectionFactory = require('../factories/collection');

const { EVENT, MESSAGE_TYPE } = require('@helpers/notifications/message_generator');

const dayjs = require('dayjs');
const _ = require('lodash');
const { randomAddress, sleep } = require('../helpers/test-utility');

describe("Test 'sync_listing'", () => {
  let broker = new ServiceBroker({ logger: false });
  broker.createService(NotificationServiceSchema);
  const syncListingService = broker.createService(ListingServiceSchema);

  beforeAll(async () => {
    process.env.NO_USERS = 6;
    await knex.seed.run({ specific: '02_users.js' });
    await broker.start();
  }, 100000);

  afterAll(async () => {
    await broker.stop();
  });

  beforeEach(async () => {
    await knex.raw('DELETE from nfts');
    await knex.raw('DELETE from listings'); // it seems like Listing.query.del() doesn't not work
  });

  describe('Test sync listing expiration', () => {
    /**
     * 1. Create 3 ONGOING listings:
     *    - listing 0 end_time < Date.now()
     *    - listing 1 end_time < Date.now()
     *    - listing 2 end_time > Date.now()
     *    - listing 3 end_time < Date.now(), status SUCCEEDED
     * 2. After calling updateListingExpiration
     *    - listing 0 status = ENDED
     *    - listing 1 status = ENDED
     *    - listing 2 status = ONGOING
     *    - listing 3 unchange
     */
    test('should update expired listing to CANCELLED', async () => {
      // setup.s
      const listings = await knex('listings')
        .insert([
          {
            seller_address: 'user address 1',
            token_id: 'token id 1',
            contract_address: 'contract address 1',
            store_address: 'store address 1',
            status: Listing.STATUSES.ONGOING,
            auction_config: {},
            end_time: dayjs().subtract(1, 'second'),
          },
          {
            seller_address: 'user address 2',
            token_id: 'token id 2',
            contract_address: 'contract address 2',
            store_address: 'store address 2',
            status: Listing.STATUSES.ONGOING,
            auction_config: {},
            end_time: dayjs().subtract(2, 'second'),
          },
          {
            seller_address: 'user address 3',
            token_id: 'token id 3',
            contract_address: 'contract address 3',
            store_address: 'store address 3',
            status: Listing.STATUSES.ONGOING,
            auction_config: {},
            end_time: dayjs().add(100, 'second'),
          },
          {
            seller_address: 'user address 4',
            token_id: 'token id 4',
            contract_address: 'contract address 4',
            store_address: 'store address 4',
            status: Listing.STATUSES.SUCCEEDED,
            auction_config: {},
            end_time: dayjs().subtract(2, 'second'),
          },
        ])
        .returning('*');

      // execute.
      await syncListingService.updateListingExpiration();

      // verify.
      const allListings = await Listing.query().whereIn(
        'id',
        listings.map((listing) =>
          listing.id),
      );
      expect(_.sortBy(allListings, 'id')).toEqual([
        {
          ...listings[0],
          status: Listing.STATUSES.ENDED,
          updated_at: expect.any(Date),
        },
        {
          ...listings[1],
          status: Listing.STATUSES.ENDED,
          updated_at: expect.any(Date),
        },
        {
          ...listings[2],
          status: Listing.STATUSES.ONGOING,
          updated_at: expect.any(Date),
        },
        listings[3],
      ]);
    });

    /**
     * 1. Create 3 ONGOING listings:
     *    - listing 0 end_time < Date.now()
     *        - create auction 2 times
     *        - 1st acution has 1 bid
     *        - 2nd auction has 2 bids
     *    - listing 1 end_time < Date.now()
     *        - create auction 1 times, no bid
     *    - listing 2 end_time > Date.now()
     *    - listing 3 end_time < Date.now(), status SUCCEEDED
     * 2. After calling updateListingExpiration
     *    - listing 0 status = ENDED
     *        - push noti to seller & 2nd bidder
     *    - listing 1 status = ENDED
     *        - push noti to seller
     *    - listing 2 status = ONGOING
     *    - listing 3 unchange

     */
    test('should update expired english auction listing & notify sellers & buyers', async () => {
      // setup.
      const users = await User.query();
      // add fcm token so firebase service can be called
      await knex('user_device_tokens')
        .insert(users.map((user) =>
          ({ user_id: user.id, fcm_token: `token${user.id}` })))
        .onConflict()
        .ignore();

      const collections = await knex('collections')
        .insert(Array.from({ length: 5 }, () =>
          CollectionFactory.build()))
        .returning('*');
      const synxTx = await SyncTx.query().insert(SyncTxFactory.build()).returning('*');
      const nfts = await knex('nfts')
        .insert(
          Array.from({ length: 5 }, (x, i) =>
            NftFactory.build({ ..._.pick(collections[i], ['contract_address', 'token_id']), sync_tx_id: synxTx.id })),
        )
        .returning('*');

      const auctionAddress = randomAddress();

      const listings = await knex('listings')
        .insert([
          ListingFactory.build({
            ..._.pick(nfts[0], ['contract_address', 'token_id']),
            type: Listing.TYPE.ENGLISH_AUCTION,
            end_time: dayjs().subtract(12, 'minute'),
            seller_address: users[0].aura_address,
            store_address: auctionAddress,
          }),
          ListingFactory.build({
            ..._.pick(nfts[1], ['contract_address', 'token_id']),
            type: Listing.TYPE.ENGLISH_AUCTION,
            end_time: dayjs().subtract(13, 'minute'),
            seller_address: users[1].aura_address,
            store_address: auctionAddress,
          }),
          ListingFactory.build({
            ..._.pick(nfts[2], ['contract_address', 'token_id']),
            type: Listing.TYPE.ENGLISH_AUCTION,
            end_time: dayjs().add(10, 'minute'),
          }),
          ListingFactory.build({
            ..._.pick(nfts[3], ['contract_address', 'token_id']),
            type: Listing.TYPE.ENGLISH_AUCTION,
            status: Listing.STATUSES.SUCCEEDED,
            end_time: dayjs().subtract(13, 'minute'),
          }),
        ])
        .returning('*');

      const createAuctionHistories = await AuctionHistory.query()
        .insertGraph([
          AuctionHistoryFactory.build({
            ..._.pick(nfts[0], ['contract_address', 'token_id']),
            auction_address: auctionAddress,
          }),
          AuctionHistoryFactory.build({
            ..._.pick(nfts[0], ['contract_address', 'token_id']),
            auction_address: auctionAddress,
          }),
          AuctionHistoryFactory.build({
            ..._.pick(nfts[1], ['contract_address', 'token_id']),
            auction_address: auctionAddress,
          }),
        ])
        .returning('*');

      await AuctionHistory.query()
        .insertGraph([
          AuctionHistoryFactory.build({
            ..._.pick(nfts[0], ['contract_address', 'token_id']),
            auction_address: auctionAddress,
            auction_event: AuctionHistory.EVENTS.BID,
            bidder_address: users[2].aura_address,
            bidding_price: 1000,
            auction_create_id: createAuctionHistories[0].id,
          }),
          AuctionHistoryFactory.build({
            ..._.pick(nfts[0], ['contract_address', 'token_id']),
            auction_address: auctionAddress,
            auction_event: AuctionHistory.EVENTS.BID,
            bidder_address: users[3].aura_address,
            bidding_price: 1000,
            auction_create_id: createAuctionHistories[1].id,
          }),
          AuctionHistoryFactory.build({
            ..._.pick(nfts[0], ['contract_address', 'token_id']),
            auction_address: auctionAddress,
            auction_event: AuctionHistory.EVENTS.BID,
            bidder_address: users[4].aura_address,
            bidding_price: 1500,
            auction_create_id: createAuctionHistories[1].id,
          }),
        ])
        .returning('*');

      // execute.
      await syncListingService.updateListingExpiration();

      // verify.
      const allListings = await Listing.query()
        .whereIn(
          'id',
          listings.map((listing) =>
            listing.id),
        )
        .orderBy('id');
      expect(allListings).toEqual([
        {
          ...listings[0],
          status: Listing.STATUSES.ENDED,
          updated_at: expect.any(Date),
        },
        {
          ...listings[1],
          status: Listing.STATUSES.ENDED,
          updated_at: expect.any(Date),
        },
        listings[2],
        listings[3],
      ]);

      // verify seller receives biding noti
      const userNotification1 = await UserNotification.query()
        .where({
          user_id: users[0].id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(_.isEmpty(userNotification1)).toBeFalsy();

      const notification1 = await Notification.query().findById(userNotification1.notification_id);
      notification1.content = JSON.parse(notification1.content);
      expect(notification1).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Auction has ended',
            body: `The auction for ${nfts[0].name} has ended, please settle the auction.`,
            imageUrl: nfts[0].metadata.s3_image,
          },
          data: {
            type: MESSAGE_TYPE.AUCTION_ENDED_SELLER,
            contract_address: nfts[0].contract_address,
            token_id: nfts[0].token_id,
            nft_name: nfts[0].name,
            time: expect.any(String),
          },
        },
      });

      // verify 2nd bidder of listing 0 received a notification
      const userNotification2 = await UserNotification.query()
        .where({
          user_id: users[4].id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(_.isEmpty(userNotification2)).toBeFalsy();

      const notification2 = await Notification.query().findById(userNotification2.notification_id);
      notification2.content = JSON.parse(notification2.content);
      expect(notification2).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Auction has ended',
            body: `The auction for ${nfts[0].name} has ended, please settle the auction.`,
            imageUrl: nfts[0].metadata.s3_image,
          },
          data: {
            type: MESSAGE_TYPE.AUCTION_ENDED_BUYER,
            contract_address: nfts[0].contract_address,
            token_id: nfts[0].token_id,
            nft_name: nfts[0].name,
            time: expect.any(String),
          },
        },
      });

      // verify seller of listing 1 received a notification
      const userNotification3 = await UserNotification.query()
        .where({
          user_id: users[1].id,
        })
        .orderBy('id', 'desc')
        .first();
      expect(_.isEmpty(userNotification3)).toBeFalsy();

      const notification3 = await Notification.query().findById(userNotification3.notification_id);
      notification3.content = JSON.parse(notification3.content);
      expect(notification3).toMatchObject({
        event: EVENT.TRADE,
        content: {
          notification: {
            title: 'Auction has ended',
            body: `The auction for ${nfts[1].name} has ended, please settle the auction.`,
            imageUrl: nfts[1].metadata.s3_image,
          },
          data: {
            type: MESSAGE_TYPE.AUCTION_ENDED_SELLER,
            contract_address: nfts[1].contract_address,
            token_id: nfts[1].token_id,
            nft_name: nfts[1].name,
            time: expect.any(String),
          },
        },
      });

      expect(mockMessaging).toHaveBeenCalledTimes(3);
    }, 100000);
  });
});
