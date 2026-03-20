const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');
const { getUserAddress, getContractAddress } = require('../helpers/test-utility');

const NftFactory = Factory.define(({ sequence }) => {
  return {
    name: faker.random.words(3) + ' #' + sequence,
    token_id: faker.datatype.hexadecimal(32),
    owner_address: getUserAddress(sequence),
    contract_address: getContractAddress(sequence),
    metadata: {},
    sync_tx_id: 0,
  };
});

module.exports = { NftFactory };
