'use strict';

const { Model } = require('objection');
const knex = require('../../config/database');
const CustomQueryBuilder = require('../helpers/custom_query_builder');

class SyncTx extends Model {
  static get tableName() {
    return 'sync_txs';
  }

  static get selectableProps() {
    return ['id', 'height', 'sync_information_id', 'raw_data', 'hash', 'height', 'msg_index', 'time', 'created_at'];
  }

  static get maxPageSize() {
    return 100;
  }

  static get QueryBuilder() {
    return CustomQueryBuilder;
  }
}

SyncTx.knex(knex);

module.exports = SyncTx;
