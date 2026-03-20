'use strict';

const lodash = require('lodash');
const { Model } = require('objection');
const BaseModel = require('./base_model');
const knex = require('../../config/database');
const { TokenHandler } = require('../helpers/jwt-token');

class User extends BaseModel {
  static get tableName() {
    return 'users';
  }

  static get softDelete() {
    return true;
  }

  static get selectableProps() {
    return ['id', 'aura_address', 'name', 'avatar', 'updated_at', 'created_at'];
  }

  static get deletedColumn() {
    return 'deleted_at';
  }

  static get relationMappings() {
    return {
      collections: {
        relation: Model.HasManyRelation,
        modelClass: 'collection',
        join: {
          from: 'users.aura_address',
          to: 'collections.owner_address',
        },
      },
      store: {
        relation: Model.HasOneRelation,
        modelClass: 'store',
        join: {
          from: 'users.aura_address',
          to: 'stores.owner_address',
        },
      },
      nfts: {
        relation: Model.HasManyRelation,
        modelClass: 'nft',
        join: {
          from: 'users.aura_address',
          to: 'nfts.owner_address',
        },
      },
      device_tokens: {
        relation: Model.HasManyRelation,
        modelClass: 'user_device_token',
        join: {
          from: 'users.id',
          to: 'user_device_tokens.user_id',
        },
      },
    };
  }

  static generateToken(user) {
    // Create token
    let token = TokenHandler.generateHasuraJWT(user.id, 'user');
    return {
      user: lodash.pick(user, ['id', 'aura_address', 'avatar']),
      token,
    };
  }

  static async register(user) {
    let userParams = { ...user };
    return this.query().insert(userParams).returning(['*']);
  }
}

User.knex(knex);

module.exports = User;
