const { Factory } = require('fishery');
const { getContractAddress, getUserAddress } = require('../helpers/test-utility');

const StoreFactory = Factory.define(({ sequence }) => {
  return {
    subdomain: 'aura-auction',
    status: 'active',
    extra_information: null,
    standard_contract_id: 0,
    contract_address: getContractAddress(sequence),
    owner_address: getUserAddress(sequence),
  };
});

module.exports = { StoreFactory };
