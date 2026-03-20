const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');

const SyncTxsFactory = Factory.define(({ sequence }) => {
  return {
    hash: faker.datatype.hexadecimal(20),
    height: 0,
    msg_index: 1,
    block_time: new Date(),
    raw_data: '{}',
  };
});

module.exports = { SyncTxsFactory };
