'use strict';

const BaseModel = require('./base_model');
const knex = require('../../config/database');

class FeaturedItems extends BaseModel {
  static get tableName() {
    return 'featured_items';
  }

  static get softDelete() {
    return true;
  }

  static get deletedColumn() {
    return 'deleted_at';
  }

  static get relationMappings() {
    return {};
  }
}

FeaturedItems.knex(knex);

module.exports = FeaturedItems;
