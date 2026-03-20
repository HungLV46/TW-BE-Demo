const { CosmWasmClient } = require('@cosmjs/cosmwasm-stargate');

const chainConfig = require('../config/chain').defaultChain;

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('sync_informations').del();
  }
  const res = await knex('standard_contracts')
    .where({ name: 'cw2981-royalties', status: 'active' })
    .select(['name', 'code_id', 'status'])
    .first();
  const queryInstantiate = { key: 'message.action', value: '/cosmwasm.wasm.v1.MsgInstantiateContract' };
  const queryCodeId = { key: 'instantiate.code_id', value: res.code_id };

  const client = await CosmWasmClient.connect(chainConfig.rpcEndpoint);
  const block = await client.getBlock();

  // only sync from current block
  return knex('sync_informations').insert([
    { height: block.header.height, key: 'cw2981-instantiation', query: { tags: [queryInstantiate, queryCodeId] } },
    { height: block.header.height, key: 'last-block-synced', query: {} },
    { height: block.header.height, key: 'horoscope-cw721-activity-id', query: 1 },
  ]);
};
