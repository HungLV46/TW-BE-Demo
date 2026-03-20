'use strict';

const QueueService = require('moleculer-bull');
const queueConfig = require('@config/queue').QueueConfig;
const { Listing, AuctionHistory } = require('@models');
const _ = require('lodash');

const { generateMessage, EVENT, MESSAGE_TYPE } = require('@helpers/notifications/message_generator');

module.exports = {
  name: 'sync-listing',
  mixins: [QueueService(queueConfig.url, queueConfig.opts)],

  queues: {
    'sync.listing-expiration': {
      concurrency: 1,
      async process(job) {
        return this.updateListingExpiration(job.data);
      },
    },
  },

  // TODO handle when expiration is by block height

  methods: {
    async updateListingExpiration() {
      const fixedPriceListings = await this.updateFixedPriceListingExperation();
      const englishAuctionListings = await this.updateEnglishAuctionListing();

      return [...fixedPriceListings, ...englishAuctionListings];
    },

    async updateFixedPriceListingExperation() {
      // find all listings with end_date < now
      return Listing.query()
        .where({ type: Listing.TYPE.FIXED_PRICE, status: Listing.STATUSES.ONGOING })
        .where('end_time', '<', new Date())
        .patch({ status: Listing.STATUSES.ENDED })
        .returning('id');
    },

    async updateEnglishAuctionListing() {
      const englishAuctionListings = await Listing.query()
        .where({ type: Listing.TYPE.ENGLISH_AUCTION, status: Listing.STATUSES.ONGOING })
        .where('end_time', '<', new Date()) // TODO check auction really end by quering to blockchain
        .withGraphFetched('[seller, nft.collection, auction_histories(latest) as latest_auction_history.bidder]');

      if (_.isEmpty(englishAuctionListings)) {
        return [];
      }

      const englishAuctionListingIds = englishAuctionListings.map((listing) =>
        listing.id);
      await Listing.query().whereIn('id', englishAuctionListingIds).patch({ status: Listing.STATUSES.ENDED });

      // notification
      const auctionEndNotis = [];
      englishAuctionListings.forEach((listing) => {
        const sellerNoti = {
          event: EVENT.TRADE,
          content: generateMessage(EVENT.TRADE, {
            message_type: MESSAGE_TYPE.AUCTION_ENDED_SELLER,
            nft: listing.nft,
          }),
          receivers: [{ user_id: listing.seller.id }],
        };
        auctionEndNotis.push(sellerNoti);

        // push noti to winner of auction
        const newestAuctionHistory = listing.latest_auction_history[0];
        const highestBid = newestAuctionHistory.auction_event === AuctionHistory.EVENTS.BID ? newestAuctionHistory.bidding_price : null;
        if (highestBid) {
          const buyerNoti = {
            event: EVENT.TRADE,
            content: generateMessage(EVENT.TRADE, {
              message_type: MESSAGE_TYPE.AUCTION_ENDED_BUYER,
              nft: listing.nft,
            }),
            receivers: [{ user_id: newestAuctionHistory.bidder.id }],
          };

          auctionEndNotis.push(buyerNoti);
        }
      });
      await this.broker.call('notification.push', { notifications: auctionEndNotis });

      return englishAuctionListingIds;
    },
  },

  events: {
    'nft.transfer': {
      params: {
        token_id: 'string',
        contract_address: 'string',
        from_address: 'string',
        $$strict: true,
      },
      handler(ctx) {
        // find ongoing listings of this nft by previous owner and invalidate them
        return Listing.query()
          .where({
            type: Listing.TYPE.FIXED_PRICE,
            token_id: ctx.params.token_id,
            contract_address: ctx.params.contract_address,
            status: Listing.STATUSES.ONGOING,
            seller_address: ctx.params.from_address,
          })
          .patch({ status: Listing.STATUSES.ENDED });
      },
    },
  },

  async started() {
    if (process.env.NODE_ENV !== 'test') {
      // we will check for listing expiration every 30 seconds, this should be enough as the main check is on contract
      await this.createJob(
        'sync.listing-expiration',
        {},
        { repeat: { every: 30000 }, removeOnComplete: 10, removeOnFail: 100 },
      );
      await this.waitForServices(['api']);
      await this.broker.call('api.add_queue', { queue_name: 'sync.listing-expiration' });
    }
  },

  async stopped() {
    await this.getQueue('sync.listing-expiration').close();
  },
};
