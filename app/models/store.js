'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class Store extends BaseModel {
  static get STATUSES() {
    return {
      INACTIVE: 'inactive',
      ACTIVE: 'active',
    };
  }

  static get tableName() {
    return 'stores';
  }

  static get relationMappings() {
    return {
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'user',
        join: {
          from: 'stores.owner_address',
          to: 'users.aura_address',
        },
      },
    };
  }

  static get selectableProps() {
    return [
      'stores.id as id',
      'stores.owner_address as owner_address',
      'stores.subdomain as subdomain',
      'stores.title as title',
      'stores.description as description',
      'stores.extra_information as extra_information',
      'stores.contract_address as contract_address',
      'stores.standard_contract_id as standard_contract_id',
      'stores.status as status',
      'stores.created_at as created_at',
      'stores.updated_at as updated_at',
    ];
  }
}

module.exports = Store;
