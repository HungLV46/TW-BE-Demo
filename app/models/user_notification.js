'use strict';

const BaseModel = require('./base_model');

class UserNotification extends BaseModel {
  static get tableName() {
    return 'user_notifications';
  }
}

module.exports = UserNotification;
