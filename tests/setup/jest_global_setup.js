'use strict';

const knex = require('../../config/database'); // TODO use alias

module.exports = async () => {
  await knex.seed.run({ specific: '00_standard_contracts.js' });
  await knex.seed.run({ specific: '01_sync_informations.js' });
  await knex.destroy();
};
