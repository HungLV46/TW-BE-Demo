'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class Whitelist extends BaseModel {
  static get tableName() {
    return 'whitelists';
  }

  static get relationMappings() {
    return {
      mint_phase: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'mint_phase',
        join: {
          from: ['whitelists.mint_phase_id'],
          to: ['mint_phases.id'],
        },
      },
    };
  }
}

module.exports = Whitelist;
