'use strict';

const path = require('path');

const migrations = {
  directory: path.join(__dirname, 'migrations'),
};

const seeds = {
  directory: path.join(__dirname, 'seeds'),
};

const baseConfig = {
  client: 'pg',
  version: '8.0',
  migrations,
  seeds,
};

const connection = {
  host: 'localhost',
  user: 'twilight_user',
  password: 'password',
  database: 'twilight_dev',
  port: '5432',
};

module.exports = {
  development: {
    ...baseConfig,
    connection,
  },
  test: {
    ...baseConfig,
    connection: {
      ...connection,
      database: 'twilight_test',
    },
  },
  staging: {
    ...baseConfig,
    connection: {
      host: process.env.TWILIGHT_DB_HOST,
      user: process.env.TWILIGHT_DB_USER,
      password: process.env.TWILIGHT_DB_PASSWORD,
      database: process.env.TWILIGHT_DB_NAME,
      port: process.env.TWILIGHT_DB_PORT,
    },
  },
  production: {
    ...baseConfig,
    connection: {
      host: process.env.TWILIGHT_DB_HOST,
      user: process.env.TWILIGHT_DB_USER,
      password: process.env.TWILIGHT_DB_PASSWORD,
      database: process.env.TWILIGHT_DB_NAME,
      port: process.env.TWILIGHT_DB_PORT,
    },
    pool: {
      min: 1,
      max: 3,
    },
  },
  onUpdateTrigger: (table) =>
    `
    CREATE TRIGGER ${table}_updated_at
    BEFORE UPDATE ON ${table}
    FOR EACH ROW
    EXECUTE PROCEDURE on_update_timestamp();`,
  dropOnUpdateTrigger: (table) =>
    `
    DROP TRIGGER IF EXISTS ${table}_updated_at
    ON ${table};`,
};
