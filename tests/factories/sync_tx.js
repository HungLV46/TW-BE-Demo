const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');

const SyncTxFactory = Factory.define(() => {
  return {
    height: faker.random.numeric(9),
    hash: faker.random.alpha(20),
    msg_index: faker.random.numeric(9),
    raw_data: {},
  };
});

module.exports = SyncTxFactory;
