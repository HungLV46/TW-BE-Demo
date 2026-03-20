'use strict';

const QueueService = require('moleculer-bull');
const queueConfig = require('@config/queue').QueueConfig;
const chainConfig = require('@config/chain').defaultChain;

const { CosmWasmClient } = require('@cosmjs/cosmwasm-stargate');

const {
  Store, Listing, NftHistory, AuctionHistory, Offer, Nft, User
} = require('@models');
const knex = require('@config/database');

const _ = require('lodash');
const { getLatestPrice, parseExpirationTime } = require('@helpers/listing');
const { generateMessage, EVENT, MESSAGE_TYPE } = require('@helpers/notifications/message_generator');
const { findAttributeValueFromEvents } = require('@helpers/blockchain_utils');

module.exports = {
  name: 'auction',

  mixins: [QueueService(queueConfig.url, queueConfig.opts)],
  queues: {
    'auction.process-tx': {
      concurrency: 1,
      process(job) {
        return this.processTxJob(job.data);
      },
    },
  },

  settings: {},

  dependencies: [],

  actions: {
    processTransaction: {
      params: {
        contract: 'object',
        txMsg: {
          type: 'object',
          props: {
            // althought we can take height and msgIndex from syncTx, we keep it here for quick access
            blockHeight: 'number',
            msgIndex: 'number',
            syncTxId: 'number',
          },
        },
        events: 'array',
      },
      handler(ctx) {
        // we will create job to process transaction
        // so we can process it in background
        // and return immediately
        // however, we will process immediately if we are in test mode (no queue)
        if (process.env.NODE_ENV === 'test') {
          return this.processTxJob(ctx.params);
        }
        return this.createJob('auction.process-tx', ctx.params, {
          removeOnComplete: 10,
          removeOnFail: 100,
          jobId: ctx.params.txMsg.txhash,
        });
      },
    },
  },

  methods: {
    // process transaction
    async processTxJob({ contract, txMsg, events }) {
      // get action
      const action = Object.keys(txMsg.msg)[0]; // TODO: when msg_id is not 0?
      // get store by contract address
      const auction = await Store.query().findOne('contract_address', '=', contract.contract_address);

      const data = txMsg.msg[action];
      await knex
        .transaction(async (trx) => {
          switch (action) {
            case 'auction_nft': {
              const listing = await Listing.query()
                .findOne({
                  token_id: data.nft.token_id,
                  contract_address: data.nft.contract_address,
                  store_address: auction.contract_address,
                })
                .withGraphFetched('nft.[collection, offerers]')
                .modifyGraph('nft.offerers', (builder) =>
                  builder.where({ status: Offer.STATUSES.ONGOING }));

              const auctionConfig = { config: data.auction_config };

              // get start time stamp from create auction message, if it doesn't exist, get it from wasm event
              let startTime = parseExpirationTime(_.get(auctionConfig, 'config.english_auction.start_time'), {
                blockHeight: txMsg.blockHeight,
                blockTime: txMsg.txTime,
              });
              const startTimeFindResult = findAttributeValueFromEvents(events, 'wasm', 'start_time');
              if (!startTime && startTimeFindResult.value) {
                // if start time from wasm event
                startTime = parseExpirationTime({ at_time: startTimeFindResult.value.replace(/\D/g, '') });
              }

              const endTime = parseExpirationTime(_.get(auctionConfig, 'config.english_auction.end_time'), {
                blockHeight: txMsg.blockHeight,
                blockTime: txMsg.txTime,
              });
              // create new listing
              const newListing = {
                token_id: data.nft.token_id,
                contract_address: data.nft.contract_address,
                store_address: auction.contract_address,
                seller_address: txMsg.sender,
                auction_config: auctionConfig,
                start_time: startTime,
                end_time: endTime,
                status: Listing.STATUSES.ONGOING,
                latest_price: getLatestPrice(auctionConfig),
                type: Listing.TYPE.ENGLISH_AUCTION,
              };
              // if listing exists, replace with new listing
              // TODO store block height in listings
              if (listing) {
                this.logger.info(`Listing ${listing.id} already exists, updating...`);
                await Promise.all([
                  Listing.query(trx).findById(listing.id).update(newListing),
                  Nft.query(trx).findById(listing.nft.id).patch({ last_listing_id: listing.id }),
                ]);
              } else {
                const updatedListing = await Listing.query(trx).insert(newListing).returning('id');
                await Nft.query(trx)
                  .where(_.pick(updatedListing, ['contract_address', 'token_id']))
                  .patch({ last_listing_id: updatedListing.id });
              }

              const nftHistory = {
                transaction_hash: txMsg.txHash,
                event: NftHistory.EVENTS.LIST,
                from_address: txMsg.sender,
                token_id: data.nft.token_id,
                transaction_time: txMsg.txTime,
                contract_address: data.nft.contract_address,
                sync_tx_id: txMsg.syncTxId,
                block_height: txMsg.blockHeight,
                price: { amount: newListing.latest_price.toString() },
              };
              await NftHistory.query(trx).insert(nftHistory);

              const auctionHistory = {
                auction_event: AuctionHistory.EVENTS.CREATE,
                contract_address: data.nft.contract_address,
                token_id: data.nft.token_id,
                auction_address: auction.contract_address,
                seller_address: txMsg.sender,
                config: newListing.auction_config,
              };
              await AuctionHistory.query(trx).insert(auctionHistory);

              const nft = listing
                ? listing.nft
                : await Nft.query()
                  .where(_.pick(newListing, ['contract_address', 'token_id']))
                  .withGraphFetched('[collection, offerers]')
                  .modifyGraph('offerers', (builder) =>
                    builder.where({ status: Offer.STATUSES.ONGOING }))
                  .first();

              // notification
              const priceChangeNoti = {
                event: EVENT.TRADE,
                content: generateMessage(EVENT.TRADE, {
                  message_type: MESSAGE_TYPE.CHANGE_PRICE,
                  nft: nft,
                  price: newListing.latest_price,
                }),
                receivers: nft.offerers.map((offerer) =>
                  ({ user_id: offerer.id })),
              };

              await this.broker.call('notification.push', { notifications: [priceChangeNoti] });

              break;
            }
            case 'bid_auction': {
              const createHistory = await AuctionHistory.query()
                .findOne({
                  auction_event: AuctionHistory.EVENTS.CREATE,
                  contract_address: data.nft.contract_address,
                  token_id: data.nft.token_id,
                  auction_address: auction.contract_address,
                })
                .withGraphFetched('[seller, nft.collection]')
                .orderBy('id', 'desc')
                .first();

              // update end time of config if it changed
              const endTimeFindResult = findAttributeValueFromEvents(events, 'wasm', 'end_time');
              if (endTimeFindResult.value) {
                // if start time from wasm event
                const currentEndTime = parseExpirationTime({
                  at_time: endTimeFindResult.value.replace(/\D/g, ''),
                });

                const listing = await Listing.query().findOne({
                  contract_address: data.nft.contract_address,
                  token_id: data.nft.token_id,
                  store_address: auction.contract_address,
                });

                if (currentEndTime.valueOf() !== listing.end_time.valueOf()) {
                  await listing.$query(trx).patch({
                    auction_config: createHistory.config,
                    end_time: currentEndTime,
                  });
                }
              }

              const prevBidHistory = await AuctionHistory.query()
                .findOne({ auction_create_id: createHistory.id })
                .orderBy('id', 'desc');

              const bidHistory = {
                auction_event: AuctionHistory.EVENTS.BID,
                contract_address: data.nft.contract_address,
                token_id: data.nft.token_id,
                auction_address: auction.contract_address,
                bidder_address: txMsg.sender,
                bidding_price: data.bid_price,
                auction_create_id: createHistory.id,
              };
              await AuctionHistory.query(trx).insert(bidHistory);

              const nftHistory = {
                transaction_hash: txMsg.txHash,
                event: NftHistory.EVENTS.PLACE_BID,
                from_address: txMsg.sender,
                to_address: auction.contract_address,
                token_id: data.nft.token_id,
                transaction_time: txMsg.txTime,
                contract_address: data.nft.contract_address,
                block_height: txMsg.blockHeight,
                sync_tx_id: txMsg.syncTxId,
                price: { amount: data.bid_price.toString() },
              };
              await NftHistory.query(trx).insert(nftHistory);

              // notification
              const notifications = [];
              const bidReceivedNoti = {
                event: EVENT.TRADE,
                content: generateMessage(EVENT.TRADE, {
                  message_type: MESSAGE_TYPE.RECEIVED_BID,
                  nft: createHistory.nft,
                  price: data.bid_price,
                }),
                receivers: [{ user_id: createHistory.seller.id }],
              };
              notifications.push(bidReceivedNoti);

              if (prevBidHistory) {
                const coinReceiveFindResult = findAttributeValueFromEvents(
                  events,
                  'coin_received',
                  'receiver',
                  (receiver) =>
                    receiver === prevBidHistory.bidder_address,
                );
                const refundAmount = events[coinReceiveFindResult.event_index].attributes[coinReceiveFindResult.attribute_index + 1].value;
                if (refundAmount) {
                  const refundUser = await User.query().findOne({
                    aura_address: prevBidHistory.bidder_address,
                  });

                  const refundNoti = {
                    event: EVENT.TRADE,
                    content: generateMessage(EVENT.TRADE, {
                      message_type: MESSAGE_TYPE.OUTBID_REFUND,
                      nft: createHistory.nft,
                      price: refundAmount.slice(0, -chainConfig.denom.length),
                      transaction_hash: txMsg.txHash,
                    }),
                    receivers: [{ user_id: refundUser.id }],
                  };
                  notifications.push(refundNoti);
                }
              }

              await this.broker.call('notification.push', { notifications });

              break;
            }
            case 'settle_auction': {
              const latestCreateHistory = await AuctionHistory.query()
                .where({
                  auction_event: AuctionHistory.EVENTS.CREATE,
                  contract_address: data.nft.contract_address,
                  token_id: data.nft.token_id,
                  auction_address: auction.contract_address,
                })
                .orderBy('id', 'desc')
                .first();

              // create auction settle history
              const auctionHistory = {
                auction_event: AuctionHistory.EVENTS.SETTLE,
                contract_address: data.nft.contract_address,
                token_id: data.nft.token_id,
                auction_address: auction.contract_address,
                settler_address: txMsg.sender,
                auction_create_id: latestCreateHistory.id,
              };
              await AuctionHistory.query(trx).insert(auctionHistory);

              // find corresponding listing
              const listing = await Listing.query()
                .findOne({
                  token_id: data.nft.token_id,
                  contract_address: data.nft.contract_address,
                  store_address: auction.contract_address,
                })
                .withGraphFetched('[seller, nft.collection]');

              const status = findAttributeValueFromEvents(events, 'wasm', 'status').value;

              let newListing;
              if (status === 'failure') {
                // no one bid
                newListing = { status: Listing.STATUSES.CANCELLED };
              } else {
                // the latest bid is also the highest one
                const highestBid = await AuctionHistory.query()
                  .where({
                    auction_event: AuctionHistory.EVENTS.BID,
                    contract_address: data.nft.contract_address,
                    token_id: data.nft.token_id,
                    auction_address: auction.contract_address,
                    auction_create_id: latestCreateHistory.id,
                  })
                  .withGraphFetched('bidder')
                  .orderBy('id', 'desc')
                  .first();

                newListing = {
                  buyer_address: highestBid.bidder_address,
                  latest_price: highestBid.bidding_price,
                  status: Listing.STATUSES.SUCCEEDED,
                };

                // update nft history if someone win the auction
                const nftHistory = {
                  transaction_hash: txMsg.txHash,
                  event: NftHistory.EVENTS.BUY,
                  from_address: listing.seller.aura_address,
                  to_address: highestBid.bidder_address,
                  token_id: data.nft.token_id,
                  transaction_time: txMsg.txTime,
                  contract_address: data.nft.contract_address,
                  block_height: txMsg.blockHeight,
                  sync_tx_id: txMsg.syncTxId,
                  price: { amount: highestBid.bidding_price },
                };
                await NftHistory.query(trx).insert(nftHistory);

                // Notification
                const sellerNoti = {
                  event: EVENT.TRADE,
                  content: generateMessage(EVENT.TRADE, {
                    message_type: MESSAGE_TYPE.AUCTION_SETTLED_SELLER,
                    nft: listing.nft,
                    price: newListing.latest_price,
                  }),
                  receivers: [{ user_id: listing.seller.id }],
                };
                const buyerNoti = {
                  event: EVENT.TRADE,
                  content: generateMessage(EVENT.TRADE, {
                    message_type: MESSAGE_TYPE.AUCTION_SETTLED_BUYER,
                    nft: listing.nft,
                    price: newListing.latest_price,
                  }),
                  receivers: [{ user_id: highestBid.bidder.id }],
                };
                await this.broker.call('notification.push', { notifications: [sellerNoti, buyerNoti] });
              }

              await listing.$query(trx).update(newListing);

              break;
            }
            default: {
              this.logger.info(`Not tracked auction action: ${action}`);
            }
          }
        })
        .catch((error) => {
          this.logger.error(`cannot sync ${action}`, error);
          throw error;
        });
    },
  },

  async started() {
    this.client = await CosmWasmClient.connect(chainConfig.rpcEndpoint);
    if (process.env.NODE_ENV !== 'test') {
      await this.waitForServices(['api']);
      await this.broker.call('api.add_queue', { queue_name: 'auction.process-tx' });
    }
  },
};
