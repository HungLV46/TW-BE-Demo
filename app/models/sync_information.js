'use strict';

const { Model } = require('objection');
const knex = require('../../config/database');
const CustomQueryBuilder = require('../helpers/custom_query_builder');

class SyncInformation extends Model {
  static get tableName() {
    return 'sync_informations';
  }

  static get selectableProps() {
    return ['id', 'height', 'key', 'query'];
  }

  static get maxPageSize() {
    return 100;
  }

  static get QueryBuilder() {
    return CustomQueryBuilder;
  }

  static get SYNC_KEY() {
    return {
      HOROSCOPE_CW721_ACTIVITY_ID: 'horoscope-cw721-activity-id',
    };
  }
}

SyncInformation.knex(knex);

module.exports = SyncInformation;
