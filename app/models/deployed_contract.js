'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class DeployedContract extends BaseModel {
  static get tableName() {
    return 'deployed_contracts';
  }

  static get softDelete() {
    return false;
  }

  static get relationMappings() {
    return {
      standardContract: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'standard_contract',
        join: {
          from: 'deployed_contracts.standard_contract_id',
          to: 'standard_contracts.id',
        },
      },
    };
  }

  static get selectableProps() {
    return [
      'deployed_contracts.id as id',
      'deployed_contracts.contract_address as contract_address',
      'deployed_contracts.standard_contract_id as standard_contract_id',
      'deployed_contracts.created_at as created_at',
      'deployed_contracts.updated_at as updated_at',
    ];
  }
}

module.exports = DeployedContract;
