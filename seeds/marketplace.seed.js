const { StoreFactory } = require('../tests/factories/store_factory');
const { DeployedContractFactory } = require('../tests/factories/deployed_contract_factory');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async (knex) => {
  const marketContract = await knex('standard_contracts').where({ name: 'nft-marketplace', status: 'active' }).first();
  const store = StoreFactory.build({ subdomain: 'aura', standard_contract_id: marketContract.id });
  await knex('stores').insert(store);

  const tokenContract = await knex('standard_contracts').where({ name: 'bidding-token', status: 'active' }).first();

  const deployedContract = DeployedContractFactory.build({
    standard_contract_id: marketContract.id,
    contract_address: store.contract_address,
  });
  const deployedTokenContract = DeployedContractFactory.build({
    standard_contract_id: tokenContract.id,
  });

  return knex('deployed_contracts').insert([deployedContract, deployedTokenContract]);
};
