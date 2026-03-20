const { DeployedContractFactory } = require('../tests/factories/deployed_contract_factory');
const { StoreFactory } = require('../tests/factories/store_factory');

exports.seed = async (knex) => {
  const auctionContract = await knex('standard_contracts').where({ name: 'nft-auction', status: 'active' }).first();
  const store = StoreFactory.build({ standard_contract_id: auctionContract.id });
  await knex('stores').insert(store);

  const deployedContract = DeployedContractFactory.build({
    standard_contract_id: auctionContract.id,
    contract_address: store.contract_address,
  });

  return knex('deployed_contracts').insert(deployedContract);
};
