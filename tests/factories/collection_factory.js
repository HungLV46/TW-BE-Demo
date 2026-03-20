const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');
const { getContractAddress, getUserAddress } = require('../helpers/test-utility');

const CollectionFactory = Factory.define(({ sequence }) => {
  return {
    name: faker.internet.userName() + ' ' + sequence,
    symbol: faker.internet.userName(),
    slug: faker.internet.userName(),
    contract_address: getContractAddress(sequence),
    standard_contract_id: 100,
    description: faker.random.words(20),
    logo: faker.image.people(200, 200, true),
    feature: faker.image.people(200, 200, true),
    banner: faker.image.people(200, 200, true),
    type: 'Art',
    minter_address: getUserAddress(sequence),
    owner_address: getUserAddress(sequence),
    royalty_percentage: 0,
    royalty_payment_address: getUserAddress(sequence),
  };
});

module.exports = { CollectionFactory };
