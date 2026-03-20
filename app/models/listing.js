'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class Listing extends BaseModel {
  static get tableName() {
    return 'listings';
  }

  static get softDelete() {
    return true;
  }

  static get relationMappings() {
    return {
      nft: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'nft',
        join: {
          from: ['listings.token_id', 'listings.contract_address'],
          to: ['nfts.token_id', 'nfts.contract_address'],
        },
      },
      collection: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'collection',
        join: {
          from: 'listings.contract_address',
          to: 'collections.contract_address',
        },
      },
      store: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'store',
        join: {
          from: 'listings.store_address',
          to: 'stores.contract_address',
        },
      },
      seller: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'user',
        join: {
          from: 'listings.seller_address',
          to: 'users.aura_address',
        },
      },
      auction_histories: {
        relation: Model.HasManyRelation,
        modelClass: 'auction_history',
        join: {
          from: ['listings.token_id', 'listings.contract_address', 'listings.store_address'],
          to: ['auction_histories.token_id', 'auction_histories.contract_address', 'auction_histories.auction_address'],
        },
      },
    };
  }

  static get jsonAttributes() {
    return ['auction_config'];
  }

  static get TYPE() {
    return {
      FIXED_PRICE: 'fixed_price',
      ENGLISH_AUCTION: 'english_auction',
    };
  }

  static get STATUSES() {
    return {
      ONGOING: 'ongoing',
      SUCCEEDED: 'succeeded',
      CANCELLED: 'cancelled',
      ENDED: 'ended',
    };
  }

  static get ORDER_TYPE() {
    return {
      RECENTLY_LISTED: 'RecentlyListed',
      LOWEST_PRICE: 'LowestPrice',
      HIGHEST_PRICE: 'HighestPrice',
    };
  }

  static get selectableProps() {
    return [
      'listings.id as id',
      'listings.token_id as token_id',
      'listings.contract_address as contract_address',
      'listings.store_address as store_address',
      'listings.seller_address as seller_address',
      'listings.status as status',
      'listings.buyer_address as buyer_address',
      'listings.auction_config as auction_config',
      'listings.latest_price as latest_price',
      'listings.updated_at as updated_at',
    ];
  }

  static get deletedColumn() {
    return 'deleted_at';
  }
}

module.exports = Listing;
