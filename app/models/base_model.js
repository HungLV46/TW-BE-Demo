'use strict';

const { Model } = require('objection');
const knex = require('@config/database');
const CustomQueryBuilder = require('@helpers/custom_query_builder');
const { NotFoundError } = require('@helpers/errors');

class BaseModel extends Model {
  static get tableName() {
    return '';
  }

  static get selectableProps() {
    return [];
  }

  static get maxPageSize() {
    return 100;
  }

  static get QueryBuilder() {
    return CustomQueryBuilder;
  }

  static get modelPaths() {
    return [__dirname];
  }

  static createNotFoundError(queryContext, props) {
    return new NotFoundError(props);
  }
}

BaseModel.knex(knex);

module.exports = BaseModel;
