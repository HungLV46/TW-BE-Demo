const { DeployedContractFactory } = require('../tests/factories/deployed_contract_factory');
const { CollectionFactory } = require('../tests/factories/collection_factory');

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await Promise.all([knex('deployed_contracts').del(), knex('collections').del()]);
  }
  const cw2981 = await knex('standard_contracts').where({ name: 'cw2981-royalties', status: 'active' }).first();
  const deployedContract = DeployedContractFactory.build({ standard_contract_id: cw2981.id });
  const collections = CollectionFactory.buildList(2, { standard_contract_id: cw2981.id });

  return Promise.all([knex('deployed_contracts').insert(deployedContract), knex('collections').insert(collections)]);
};
