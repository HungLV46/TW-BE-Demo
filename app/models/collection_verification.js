'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class CollectionVerification extends BaseModel {
  static get tableName() {
    return 'collection_verifications';
  }

  static get jsonAttributes() {
    return ['authorization'];
  }

  static get TYPES() {
    return {
      TWITTER: 'twitter',
      DISCORD: 'discord',
      TELEGRAM: 'telegram',
    };
  }

  static get relationMappings() {
    return {
      collection: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'collection',
        join: {
          from: 'collection_verifications.contract_address',
          to: 'collections.contract_address',
        },
      },
    };
  }
}

module.exports = CollectionVerification;
