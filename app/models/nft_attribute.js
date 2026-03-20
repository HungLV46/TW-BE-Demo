'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class NftAttribute extends BaseModel {
  static get tableName() {
    return 'nft_attributes';
  }

  static get relationMappings() {
    return {
      collection: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'collection',
        join: {
          from: 'nft_attributes.collection_id',
          to: 'collections.id',
        },
      },
      nft: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'nft',
        join: {
          from: 'nft_attributes.nft_id',
          to: 'nfts.id',
        },
      },
    };
  }
}

module.exports = NftAttribute;
