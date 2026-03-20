'use strict';

const BaseModel = require('./base_model');

class StandardContract extends BaseModel {
  static get tableName() {
    return 'standard_contracts';
  }

  static get selectableProps() {
    return ['id', 'name', 'description', 'code_id', 'status'];
  }

  static get TYPES() {
    return {
      CW2981: 'cw2981-royalties',
      MARKETPLACE: 'nft-marketplace',
      BIDDING_TOKEN: 'bidding-token',
      LAUNCHPAD: 'nft-launchpad',
      AUCTION: 'nft-auction',
    };
  }

  static get STATUSES() {
    return {
      ACTIVE: 'active',
      INACTIVE: 'inactive',
    };
  }

  static getActive(type) {
    return this.query().where({ name: type, status: this.STATUSES.ACTIVE }).first();
  }
}

module.exports = StandardContract;
