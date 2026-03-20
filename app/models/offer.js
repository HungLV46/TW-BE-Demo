'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class Offer extends BaseModel {
  static get tableName() {
    return 'offers';
  }

  static get jsonAttributes() {
    return ['price'];
  }

  static get STATUSES() {
    return {
      ONGOING: 'ongoing',
      ACCEPTED: 'accepted',
      CANCELLED: 'cancelled',
      ENDED: 'ended',
    };
  }

  static get relationMappings() {
    return {
      nft: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'nft',
        join: {
          from: ['offers.token_id', 'offers.contract_address'],
          to: ['nfts.token_id', 'nfts.contract_address'],
        },
      },
    };
  }
}

module.exports = Offer;
