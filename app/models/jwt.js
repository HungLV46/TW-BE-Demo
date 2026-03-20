'use strict';

const { Model } = require('objection');
const knex = require('../../config/database');
const CustomQueryBuilder = require('../helpers/custom_query_builder');

class Jwt extends Model {
  static get tableName() {
    return 'jwts';
  }

  static get QueryBuilder() {
    return CustomQueryBuilder;
  }

  static get deletedColumn() {
    return 'deleted_at';
  }

  static get softDelete() {
    return true;
  }

  static logout(token) {
    return this.query().where('jti', token.jti).whereNotDeleted().delete(true);
  }
}

Jwt.knex(knex);

module.exports = Jwt;
