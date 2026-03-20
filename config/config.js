'use strict';

require('dotenv').config();

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'JWT_SECRET',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'JWT_REFRESH_SECRET',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
};
