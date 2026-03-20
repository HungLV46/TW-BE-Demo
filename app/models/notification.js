'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class Notification extends BaseModel {
  static get tableName() {
    return 'notifications';
  }

  static get relationMappings() {
    return {
      receivers: {
        relation: Model.HasManyRelation,
        modelClass: 'user_notification',
        join: {
          from: 'notifications.id',
          to: 'user_notifications.notification_id',
        },
      },
    };
  }
}

module.exports = Notification;
