'use strict';

const _ = require('lodash');

const {
  User, Store, Listing, Nft, NftHistory, Offer, DeployedContract, StandardContract
} = require('@models');
const QueueService = require('moleculer-bull');
const queueConfig = require('@config/queue').QueueConfig;
const { getLatestPrice, parseExpirationTime } = require('@helpers/listing');
const knex = require('@config/database');
const { generateMessage, EVENT, MESSAGE_TYPE } = require('@helpers/notifications/message_generator');
const { findAttributeValueFromEvents } = require('@helpers/blockchain_utils');

module.exports = {
  name: 'marketplace',

  mixins: [QueueService(queueConfig.url, queueConfig.opts)],
  queues: {
    'marketplace.process-tx': {
      concurrency: 1,
      process(job) {
        return this.processTxJob(job.data);
      },
    },
  },

  settings: {},

  dependencies: [],

  actions: {
    /**
     * return current configuration of marketplace
     * for now, just contract address
     *
     * @returns
     */
    config: {
      async handler() {
        // get the faked marketplace & auction' store
        const stores = await Store.query()
          .where({ status: Store.STATUSES.ACTIVE })
          .whereIn('subdomain', ['aura', 'aura-auction'])
          .orderBy('subdomain');
        const deployedContract = await DeployedContract.query()
          .withGraphJoined('standardContract')
          .where({ status: StandardContract.STATUSES.ACTIVE, name: StandardContract.TYPES.BIDDING_TOKEN })
          .orderBy('id', 'desc')
          .first();

        return {
          marketplace_contract_address: stores[0].contract_address,
          auction_contract_address: stores[1].contract_address,
          bidding_token_contract_address: deployedContract.contract_address,
        };
      },
    },

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
        return this.createJob('marketplace.process-tx', ctx.params, {
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
      const store = await Store.query().findOne('contract_address', '=', contract.contract_address);

      // sanity check
      // assert(store.subdomain === 'aura', 'Store not found');
      const data = txMsg.msg[action];

      await knex
        .transaction(async (trx) => {
          switch (action) {
            case 'list_nft': {
              // TODO we can list 1 NFT in multiple stores, so we need to create multiple listings
              // find corresponding listing
              const listing = await Listing.query()
                .findOne({
                  token_id: data.token_id,
                  contract_address: data.contract_address,
                  store_address: store.contract_address,
                })
                .withGraphFetched('nft.[collection, offerers]')
                .modifyGraph('nft.offerers', (builder) =>
                  builder.where({ status: Offer.STATUSES.ONGOING }));

              const auctionConfig = {
                type_id: data.auction_type_id,
                config: data.auction_config,
              };

              // get start_time and end_time from auctionConfig
              let startTime = parseExpirationTime(_.get(auctionConfig, 'config.fixed_price.start_time'), {
                blockHeight: txMsg.blockHeight,
                blockTime: txMsg.txTime,
              });
              let endTime = parseExpirationTime(_.get(auctionConfig, 'config.fixed_price.end_time'), {
                blockHeight: txMsg.blockHeight,
                blockTime: txMsg.txTime,
              });

              // create new listing
              const newListing = {
                token_id: data.token_id,
                contract_address: data.contract_address,
                store_address: store.contract_address,
                seller_address: txMsg.sender,
                auction_config: auctionConfig,
                start_time: startTime,
                end_time: endTime,
                status: Listing.STATUSES.ONGOING,
                buyer_address: '',
                latest_price: getLatestPrice(auctionConfig),
              };

              // if listing exists, replace with new listing
              // TODO store block height in listings
              // CAUTION: last_listing_id is created so that we can construct searching NFTs query
              // without the need for complex joining clauses with the listings table, hence improving performance.
              // One thing to keep in mind is that there are only 2 types of listing (at the moment),
              // which are fixed price and auction. After listing by auction, NFT will be transfered so
              // status of other listing will be changed to expired. So not effecting the ordering NFTs prioritize ongoing ones.
              // If more types of listings are introduced in the future, they should be carefully verified to ensure that they
              // do not affect NFT orders of the search query.
              if (listing) {
                this.logger.info(`Listing ${listing.id} already exists, updating...`);
                await Promise.all([
                  Listing.query(trx).findById(listing.id).update(newListing),
                  Nft.query(trx).findById(listing.nft.id).patch({ last_listing_id: listing.id }),
                ]);

                // notify offerers if price changed
                if (listing.latest_price !== newListing.latest_price.toString()) {
                  // notification
                  const priceChangeNoti = {
                    event: EVENT.TRADE,
                    content: generateMessage(EVENT.TRADE, {
                      message_type: MESSAGE_TYPE.CHANGE_PRICE,
                      nft: listing.nft,
                      price: newListing.latest_price,
                    }),
                    receivers: listing.nft.offerers.map((offerer) =>
                      ({ user_id: offerer.id })),
                  };

                  await this.broker.call('notification.push', { notifications: [priceChangeNoti] });
                }
              } else {
                const listingForUpdate = await Listing.query(trx).insert(newListing).returning('id');

                const nft = await Nft.query()
                  .where(_.pick(newListing, ['contract_address', 'token_id']))
                  .withGraphFetched('[collection, offerers]')
                  .first();

                await nft.$query(trx).patch({ last_listing_id: listingForUpdate.id });

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
              }

              const nftHistory = {
                transaction_hash: txMsg.txHash,
                event: NftHistory.EVENTS.LIST,
                from_address: txMsg.sender,
                token_id: data.token_id,
                transaction_time: txMsg.txTime,
                contract_address: data.contract_address,
                sync_tx_id: txMsg.syncTxId,
                block_height: txMsg.blockHeight,
                price: { amount: getLatestPrice(auctionConfig) },
              };
              await NftHistory.query(trx).insert(nftHistory);
              break;
            }
            case 'buy': {
              // find corresponding listing
              const listing = await Listing.query()
                .findOne({
                  token_id: data.token_id,
                  contract_address: data.contract_address,
                  store_address: store.contract_address,
                })
                .withGraphFetched('[nft.collection, seller]');

              // update listing with buyer_address
              const newListing = {
                buyer_address: txMsg.sender,
                status: Listing.STATUSES.SUCCEEDED,
              };
              await listing.$query(trx).update(newListing);

              // update nft history
              const nftHistory = {
                transaction_hash: txMsg.txHash,
                event: NftHistory.EVENTS.BUY,
                from_address: listing.seller_address,
                to_address: txMsg.sender, // TODO: buyer may not be sender
                token_id: data.token_id,
                transaction_time: txMsg.txTime,
                contract_address: data.contract_address,
                block_height: txMsg.blockHeight,
                sync_tx_id: txMsg.syncTxId,
                price: txMsg.funds[0],
              };
              await NftHistory.query(trx).insert(nftHistory);

              // notification
              const sellerNoti = {
                event: EVENT.TRADE,
                content: generateMessage(EVENT.TRADE, {
                  message_type: MESSAGE_TYPE.BUY_SELLER,
                  nft: listing.nft,
                  price: listing.latest_price,
                }),
                receivers: [{ user_id: listing.seller.id }],
              };

              const buyer = await User.query().where({ aura_address: newListing.buyer_address }).first();
              const buyerNoti = {
                event: EVENT.TRADE,
                content: generateMessage(EVENT.TRADE, {
                  message_type: MESSAGE_TYPE.BUY_BUYER,
                  nft: listing.nft,
                  price: listing.latest_price,
                }),
                receivers: [{ user_id: buyer.id }],
              };

              await this.broker.call('notification.push', { notifications: [sellerNoti, buyerNoti] });
              break;
            }
            case 'cancel': {
              // find corresponding listing
              const listing = await Listing.query().findOne({
                token_id: data.token_id,
                contract_address: data.contract_address,
                store_address: store.contract_address,
              });

              // update listing status to cancel
              await listing.$query(trx).update({
                status: Listing.STATUSES.CANCELLED,
              });

              const nftHistory = {
                transaction_hash: txMsg.txHash,
                event: NftHistory.EVENTS.LIST_CANCELLED,
                from_address: txMsg.sender,
                token_id: data.token_id,
                transaction_time: txMsg.txTime,
                contract_address: data.contract_address,
                sync_tx_id: txMsg.syncTxId,
                block_height: txMsg.blockHeight,
                price: { amount: listing.latest_price },
              };
              await NftHistory.query(trx).insert(nftHistory);
              break;
            }
            case 'offer_nft': {
              const offer = {
                offerer_address: txMsg.sender,
                token_id: data.nft.token_id,
                contract_address: data.nft.contract_address,
                store_address: store.contract_address,
                status: Offer.STATUSES.ONGOING,
                price: { amount: data.funds_amount },
                order_price: data.funds_amount,
                end_time: parseExpirationTime(data.end_time, {
                  blockHeight: txMsg.blockHeight,
                  blockTime: txMsg.txTime,
                }),
              };
              await Offer.query(trx)
                .insert(offer)
                .onConflict(['contract_address', 'token_id', 'store_address', 'offerer_address'])
                .merge();
              const nftHistory = {
                transaction_hash: txMsg.txHash,
                event: NftHistory.EVENTS.OFFER,
                from_address: txMsg.sender,
                token_id: data.nft.token_id,
                transaction_time: txMsg.txTime,
                contract_address: data.nft.contract_address,
                block_height: txMsg.blockHeight,
                sync_tx_id: txMsg.syncTxId,
                price: { amount: data.funds_amount },
              };
              await NftHistory.query(trx).insert(nftHistory);

              const nft = await Nft.query()
                .where({ contract_address: offer.contract_address, token_id: offer.token_id })
                .withGraphFetched('[collection, owner]')
                .first();

              if (nft.owner) {
                const makeOfferNoti = {
                  event: EVENT.TRADE,
                  content: generateMessage(EVENT.TRADE, {
                    message_type: MESSAGE_TYPE.MAKE_OFFER,
                    nft,
                    price: offer.price.amount,
                  }),
                  receivers: [{ user_id: nft.owner.id }],
                };

                await this.broker.call('notification.push', { notifications: [makeOfferNoti] });
              }
              break;
            }
            case 'accept_nft_offer': {
              const offer = await Offer.query()
                .findOne({
                  offerer_address: data.offerer,
                  token_id: data.nft.token_id,
                  contract_address: data.nft.contract_address,
                  store_address: store.contract_address,
                  status: Offer.STATUSES.ONGOING,
                })
                .withGraphFetched('nft.[collection, owner]');

              await offer.$query(trx).update({ status: Offer.STATUSES.ACCEPTED });

              // TODO refactor: same as buy
              // update corresponding listing if exists
              await Listing.query(trx)
                .findOne({
                  token_id: data.nft.token_id,
                  contract_address: data.nft.contract_address,
                  store_address: store.contract_address,
                  status: Listing.STATUSES.ONGOING,
                })
                .update({
                  status: Listing.STATUSES.CANCELLED, // TODO find corresponding event before update
                });

              // find wasm events
              const ownerFindResult = findAttributeValueFromEvents(events, 'wasm', 'owner');
              if (ownerFindResult.value) {
                const sender = ownerFindResult.value;
                const nftHistory = {
                  transaction_hash: txMsg.txHash,
                  event: NftHistory.EVENTS.BUY,
                  from_address: sender,
                  to_address: data.offerer,
                  token_id: data.nft.token_id,
                  transaction_time: txMsg.txTime,
                  contract_address: data.nft.contract_address,
                  block_height: txMsg.blockHeight,
                  sync_tx_id: txMsg.syncTxId,
                  price: { amount: data.funds_amount },
                };
                await NftHistory.query(trx).insert(nftHistory);

                const sellerNoti = {
                  event: EVENT.TRADE,
                  content: generateMessage(EVENT.TRADE, {
                    message_type: MESSAGE_TYPE.ACCEPT_OFFER_SELLER,
                    nft: offer.nft,
                    price: nftHistory.price.amount,
                  }),
                  receivers: [{ user_id: offer.nft.owner.id }],
                };

                const buyer = await User.query().where({ aura_address: data.offerer }).first();
                const buyerNoti = {
                  event: EVENT.TRADE,
                  content: generateMessage(EVENT.TRADE, {
                    message_type: MESSAGE_TYPE.ACCEPT_OFFER_BUYER,
                    nft: offer.nft,
                    price: nftHistory.price.amount,
                  }),
                  receivers: [{ user_id: buyer.id }],
                };

                await this.broker.call('notification.push', { notifications: [sellerNoti, buyerNoti] });
              }

              break;
            }
            case 'cancel_offer': {
              const offers = await Offer.query(trx)
                .where({ offerer_address: txMsg.sender })
                .whereIn('status', [Offer.STATUSES.ONGOING, Offer.STATUSES.ENDED])
                .whereIn(
                  ['contract_address', 'token_id'],
                  data.nfts.map((nft) =>
                    [nft.contract_address, nft.token_id]),
                )
                .update({ status: Offer.STATUSES.CANCELLED })
                .returning('*');
              const nftHistories = offers.map((offer) =>
                ({
                  transaction_hash: txMsg.txHash,
                  event: NftHistory.EVENTS.OFFER_CANCELLED,
                  from_address: txMsg.sender,
                  token_id: offer.token_id,
                  transaction_time: txMsg.txTime,
                  contract_address: offer.contract_address,
                  block_height: txMsg.blockHeight,
                  sync_tx_id: txMsg.syncTxId,
                  price: offer.price,
                }));

              await knex('nft_histories').insert(nftHistories).transacting(trx);
              break;
            }
            default: {
              this.logger.info(`Not tracked marketplace action: ${action}`);
            }
          }
        })
        .catch((error) => {
          this.logger.error(`cannot sync ${action}`, error);
        });
    },
  },

  async started() {
    if (process.env.NODE_ENV !== 'test') {
      await this.waitForServices(['api']);
      await this.broker.call('api.add_queue', { queue_name: 'marketplace.process-tx' });
    }
  },
};
