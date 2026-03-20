if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('DO NOT RUN IN PRODUCTION!!');
  throw new Error('production environment not supported');
}

const { MsgInstantiateContract } = require('cosmjs-types/cosmwasm/wasm/v1/tx');
const { toUtf8 } = require('@cosmjs/encoding');
const { logs } = require('@cosmjs/stargate');

const { faker } = require('@faker-js/faker');
const _ = require('lodash');

const chainConfig = require('../config/chain').defaultChain;
const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');

const NO_COLLECTIONS = process.env.NO_COLLECTIONS || 50;

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('collections').del();
  }

  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const instantiatorAddress = (await wallet.getAccounts())[0].address;

  const cw2981 = await knex('standard_contracts').where({ name: 'cw2981-royalties', status: 'active' }).first();
  const users = await knex('users').orderBy('id', 'asc');

  const msgs = _.range(NO_COLLECTIONS).map((index) => {
    const name = faker.commerce.productName();
    return {
      name,
      symbol: name
        .replace(/[aeiou\s]/gi, '')
        .slice(0, 5)
        .toUpperCase(),
      minter: users[index % users.length].aura_address,
      royalty_percentage: 15,
      royalty_payment_address: users[index % users.length].aura_address,
    };
  });

  // Blockchain: instantiate CW2891 contract
  const instantiateContractMsgs = msgs.map((msg) =>
    ({
      typeUrl: '/cosmwasm.wasm.v1.MsgInstantiateContract',
      value: MsgInstantiateContract.fromPartial({
        sender: instantiatorAddress,
        codeId: parseInt(cw2981.code_id, 10),
        label: `${cw2981.code_id} instance`,
        msg: toUtf8(JSON.stringify(msg)),
      }),
    }));
  const response = await client.signAndBroadcast(instantiatorAddress, instantiateContractMsgs, 'auto');

  // Database: create collections and deployed contracts
  // TODO repace with sync function
  const collections = [];
  const deployedContracts = [];
  const lastCollectionId = (await knex('collections').max('id'))[0].max;
  logs.parseRawLog(response.rawLog).forEach((parsedLog) => {
    const index = parsedLog.msg_index; // TODO check if msg_index is the same as index of messages array
    const msg = msgs[index];
    const name = msg.name;
    const contractAddress = logs.findAttribute([parsedLog], 'instantiate', '_contract_address').value;
    const image = faker.image.cats(200, 200, true).replace('?', '?lock=');
    const minterAddress = msgs[index].minter;

    collections[index] = {
      name,
      symbol: name
        .replace(/[aeiou\s]/gi, '')
        .slice(0, 5)
        .toUpperCase(),
      slug: name.toLowerCase().replaceAll(' ', '_') + '_' + (lastCollectionId + index),
      contract_address: contractAddress,
      standard_contract_id: cw2981.id,
      description: faker.commerce.productDescription(),
      logo: image,
      feature: image,
      banner: faker.image.abstract(1200, 500, true).replace('?', '?lock='),
      type: 'Art',
      minter_address: minterAddress,
      owner_address: minterAddress,
      royalty_percentage: msg.royalty_percentage,
      royalty_payment_address: msg.royalty_payment_address,
    };

    deployedContracts[index] = {
      standard_contract_id: cw2981.id,
      contract_address: contractAddress,
    };
  });

  return Promise.all([knex('collections').insert(collections), knex('deployed_contracts').insert(deployedContracts)]);
};
