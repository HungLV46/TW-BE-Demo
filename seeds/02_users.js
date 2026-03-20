if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('DO NOT RUN IN PRODUCTION!!');
  throw new Error('production environment not supported');
}
const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');
const { faker } = require('@faker-js/faker');
const { coins } = require('@cosmjs/proto-signing');

const chainConfig = require('../config/chain').defaultChain;

const NO_USERS = process.env.NO_USERS || 50;

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('user_device_tokens').del();
    await knex('user_notifications').del();
    await knex('users').del();
  }

  const { client, wallet } = await setupBlockchainClient(chainConfig, NO_USERS);
  const accounts = await wallet.getAccounts();

  // Blockchain: send some coins to each users
  const sendMsgs = accounts.slice(1).map((account) => {
    return {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: {
        fromAddress: accounts[0].address,
        toAddress: account.address,
        amount: coins(10000000, chainConfig.denom),
      },
    };
  });
  await client.signAndBroadcast(accounts[0].address, sendMsgs, 'auto');

  // DB: insert user into DB
  const users = accounts.slice(1).map((account) =>
    ({
      aura_address: account.address,
      name: faker.internet.userName(),
      avatar: faker.image.people(200, 200, true).replace('?', '?lock='),
      cover_picture: faker.image.people(200, 200, true).replace('?', '?lock='),
    }));
  return knex('users').insert(users);
};
