'use strict';

const { MoleculerError } = require('moleculer').Errors;

class AuthenticationError extends MoleculerError {
  constructor(message, data) {
    super();
    this.message = message;
    this.data = data;
    this.code = 401;
    this.type = 'AuthenticationError';
  }
}
class ConflictError extends MoleculerError {
  constructor(message, data) {
    super();
    this.message = message;
    this.data = data;
    this.code = 409;
    this.type = 'Conflict';
  }
}
class UnexpectedError extends MoleculerError {
  constructor(message, data) {
    super();
    this.message = message;
    this.data = data;
    this.code = 500;
    this.type = 'UnexpectedError';
  }
}
class NotFoundError extends MoleculerError {
  constructor(message, data) {
    super();
    this.message = message;
    this.data = data;
    this.code = 404;
    this.type = 'NotFoundError';
  }
}
class ValidationError extends MoleculerError {
  constructor(message, data) {
    super();
    this.message = message;
    this.data = data;
    this.code = 422;
    this.type = 'ValidationError';
  }
}

module.exports = {
  AuthenticationError,
  UnexpectedError,
  NotFoundError,
  ValidationError,
  ConflictError,
};
