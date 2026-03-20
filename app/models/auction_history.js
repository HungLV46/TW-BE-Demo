'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class AuctionHistory extends BaseModel {
  static get tableName() {
    return 'auction_histories';
  }

  static get EVENTS() {
    return {
      CREATE: 'create',
      BID: 'bid',
      SETTLE: 'settle',
    };
  }

  static get jsonAttributes() {
    return ['config'];
  }

  static get relationMappings() {
    return {
      seller: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'user',
        join: {
          from: 'auction_histories.seller_address',
          to: 'users.aura_address',
        },
      },
      nft: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'nft',
        join: {
          from: ['auction_histories.token_id', 'auction_histories.contract_address'],
          to: ['nfts.token_id', 'nfts.contract_address'],
        },
      },
      bidder: {
        relation: Model.HasOneRelation,
        modelClass: 'user',
        join: {
          from: 'auction_histories.bidder_address',
          to: 'users.aura_address',
        },
      },
    };
  }

  static get modifiers() {
    return {
      highest_bid(builder) {
        builder.where({ auction_event: 'bid' }).orderBy('bidding_price', 'desc').first();
      },

      latest(builder) {
        builder.orderBy('id', 'desc').first();
      },
    };
  }
}

module.exports = AuctionHistory;
