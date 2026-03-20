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

const NO_STORES = process.env.NO_STORES || 10;

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('stores').del();
  }

  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const instantiatorAddress = (await wallet.getAccounts())[0].address;
  const storeContract = await knex('standard_contracts').where({ name: 'nft-store', status: 'active' }).first();
  const users = await knex('users').orderBy('id', 'asc');

  const stores = [];
  const deployedContracts = [];

  const msgs = _.range(NO_STORES).map((index) =>
    ({ owner: users[index % users.length].aura_address }));

  // Blockchain: instantiate STORE contract
  const instantiateContractMsgs = msgs.map((msg) =>
    ({
      typeUrl: '/cosmwasm.wasm.v1.MsgInstantiateContract',
      value: MsgInstantiateContract.fromPartial({
        sender: instantiatorAddress,
        codeId: parseInt(storeContract.code_id, 10),
        label: `${storeContract.code_id} instance`,
        msg: toUtf8(JSON.stringify(msg)),
        admin: msg.owner,
      }),
    }));
  const response = await client.signAndBroadcast(instantiatorAddress, instantiateContractMsgs, 'auto');

  // Database: create collections and deployed contracts
  // TODO repace with sync function
  logs.parseRawLog(response.rawLog).forEach((parsedLog) => {
    const index = parsedLog.msg_index; // TODO check if msg_index is the same as index of messages array
    const contractAddress = logs.findAttribute([parsedLog], 'instantiate', '_contract_address').value;
    const subdomain = faker.internet.domainWord() + '-store';
    const textFont = 'SFProDisplay';
    stores.push({
      subdomain,
      title: subdomain.replaceAll('-', ' '),
      status: 'active',
      description: 'description',
      extra_information: {
        logo: faker.image.cats(200, 200, true).replace('?', '?lock='),
        discord: '',
        twitter: '',
        website: '',
        telegram: '',
        linkColor: faker.color.rgb(),
        bannerImage: faker.image.cats(1200, 500, true).replace('?', '?lock='),
        buttonColor: faker.color.rgb(),
        bodyTextFont: textFont,
        bodyTextColor: faker.color.rgb(),
        backgroundColor: faker.color.rgb(),
        headingTextFont: textFont,
        headingTextColor: faker.color.rgb(),
        navigationTextColor: faker.color.rgb(),
        navigationBackgroundColor: faker.color.rgb(),
      },
      contract_address: contractAddress,
      standard_contract_id: storeContract.id,
      owner_address: msgs[index].owner,
    });

    deployedContracts.push({
      contract_address: contractAddress,
      standard_contract_id: storeContract.id,
    });
  });

  return Promise.all([knex('stores').insert(stores), knex('deployed_contracts').insert(deployedContracts)]);
};
