'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');
const { URL } = require('url');

class Nft extends BaseModel {
  static get tableName() {
    return 'nfts';
  }

  static get relationMappings() {
    return {
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'user',
        join: {
          from: 'nfts.owner_address',
          to: 'users.aura_address',
        },
      },
      offerers: {
        relation: Model.ManyToManyRelation,
        modelClass: 'user',
        join: {
          from: ['nfts.token_id', 'nfts.contract_address'],
          through: {
            from: ['offers.token_id', 'offers.contract_address'],
            to: 'offers.offerer_address',
          },
          to: 'users.aura_address',
        },
      },
      collection: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'collection',
        join: {
          from: 'nfts.contract_address',
          to: 'collections.contract_address',
        },
      },
      listing: {
        relation: Model.HasOneRelation,
        modelClass: 'listing',
        join: {
          from: ['nfts.token_id', 'nfts.contract_address'],
          to: ['listings.token_id', 'listings.contract_address'],
        },
      },
      last_listing: {
        relation: Model.HasOneRelation,
        modelClass: 'listing',
        join: {
          from: 'nfts.last_listing_id',
          to: 'listings.id',
        },
      },
      nft_attributes: {
        relation: Model.HasManyRelation,
        modelClass: 'nft_attribute',
        join: {
          from: 'nfts.id',
          to: 'nft_attributes.nft_id',
        },
      },
      syncTx: {
        relation: Model.HasOneRelation,
        modelClass: 'sync_tx',
        join: {
          from: 'nfts.sync_tx_id',
          to: 'sync_txs.id',
        },
      },
    };
  }

  static get jsonAttributes() {
    return ['metadata'];
  }

  static get ORDER_TYPE() {
    return {
      RECENTLY_CREATED: 'RecentlyCreated',
      RECENTLY_LISTED: 'RecentlyListed',
      RECENTLY_SOLD: 'RecentlySold',
      LOWEST_PRICE: 'LowestPrice',
      HIGHEST_PRICE: 'HighestPrice',
      ENDING_SOON: 'EndingSoon',
    };
  }

  static get selectableProps() {
    return [
      'nfts.id as id',
      'nfts.name as name',
      'nfts.token_id as token_id',
      'nfts.contract_address as contract_address',
      'nfts.owner_address as owner_address',
      'nfts.metadata as metadata',
    ];
  }

  getImageUrl() {
    return this.metadata && this.metadata.s3_image ? new URL(this.metadata.s3_image).href : undefined;
  }

  isBurned() {
    return this.burned_at != null;
  }
}

module.exports = Nft;
