'use strict';

const knex = require('@config/database');
const BaseModel = require('./base_model');

class UserDeviceToken extends BaseModel {
  static get tableName() {
    return 'user_device_tokens';
  }

  static get selectableProps() {
    return [
      'id',
      'user_id',
      // 'device_id',
      'fcm_token',
      // 'voip_token',
      // 'os',
      // 'os_version',
      // 'device_model',
      'created_at',
      'updated_at',
    ];
  }

  static get softDelete() {
    return false;
  }
}

UserDeviceToken.knex(knex);

module.exports = UserDeviceToken;
