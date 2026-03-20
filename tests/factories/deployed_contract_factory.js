const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');

const DeployedContractFactory = Factory.define(({ sequence }) => {
  return {
    contract_address: 'aura' + faker.random.alphaNumeric(59),
    standard_contract_id: sequence,
  };
});

module.exports = { DeployedContractFactory };
