'use strict';

const BaseModel = require('./base_model');
const knex = require('../../config/database');
const { TokenHandler } = require('../helpers/jwt-token');

class AdminUser extends BaseModel {
  static get tableName() {
    return 'admin_users';
  }

  static get softDelete() {
    return true;
  }

  static get selectableProps() {
    return ['id', 'email', 'name', 'avatar', 'role'];
  }

  static get deletedColumn() {
    return 'deleted_at';
  }

  static get relationMappings() {
    return {};
  }

  static generateToken({ role, ...user }) {
    const token = TokenHandler.generateHasuraJWT(user.id, role);
    return { user, token };
  }
}

AdminUser.knex(knex);

module.exports = AdminUser;
