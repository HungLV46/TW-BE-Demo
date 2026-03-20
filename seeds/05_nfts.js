if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('DO NOT RUN IN PRODUCTION!!');
  throw new Error('production environment not supported');
}

const { toUtf8 } = require('@cosmjs/encoding');
const { faker } = require('@faker-js/faker');
const _ = require('lodash');

const chainConfig = require('../config/chain').defaultChain;
const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');

const NO_NFTS = process.env.NO_NFTS || 10;

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('nfts').del();
  }

  const collections = await knex('collections').orderBy('id', 'asc');
  const users = await knex('users')
    .whereIn(
      'aura_address',
      collections.map((c) =>
        c.minter_address),
    )
    .orderBy('id', 'asc');
  const collectionByOwnerAddress = _.keyBy(collections, 'minter_address');

  const client = (await setupBlockchainClient(chainConfig, users.length)).client;

  // format of msgs: [[minting messages of 1 user], [mintting messages of the next user], ...]
  const allUserMsgs = users.map((user) => {
    const ownerAddress = user.aura_address;
    return _.range(NO_NFTS).map(() => {
      const name = faker.commerce.productName();
      const imageName = name.split(' ').slice(-1)[0];
      const attributes = Array.from(Array(faker.mersenne.rand(10, 4)), () =>
        ({
          trait_type: faker.word.noun(),
          value: faker.word.adjective(),
        }));
      return {
        mint: {
          owner: ownerAddress,
          token_id: faker.datatype.hexadecimal(32),
          extension: {
            name,
            image: `https://loremflickr.com/500/500/${imageName}?lock=${faker.mersenne.rand(10000, 1000)}`,
            external_url: faker.internet.url(),
            description: faker.commerce.productDescription(),
            attributes,
            background_color: faker.datatype.hexadecimal(6).slice(2),
            // royalty_percentage: 15,
            // royalty_payment_address: ownerAddress,
          },
        },
      };
    });
  });

  // Blockchain: mint NFTs
  const mintExecutionPromises = allUserMsgs.map((userMsgs) => {
    const senderAddress = userMsgs[0].mint.owner;
    const mintMsgs = userMsgs.map((userMsg) =>
      ({
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: senderAddress,
          contract: collectionByOwnerAddress[senderAddress].contract_address,
          msg: toUtf8(JSON.stringify(userMsg)),
        },
      }));
    return client.signAndBroadcast(senderAddress, mintMsgs, 'auto');
  });
  await Promise.allSettled(mintExecutionPromises);

  // Database: create collections and deployed contracts
  // TODO repace with sync function
  const syncTxs = _.range(NO_NFTS * users.length).map((index) =>
    // fake sync_txs data
    ({
      hash: 'fake',
      height: 0,
      msg_index: index % NO_NFTS,
      block_time: new Date(),
      raw_data: '{}',
    }));
  const insertedSyncTxs = await knex('sync_txs').insert(syncTxs).returning('*');

  const nfts = [];
  allUserMsgs.forEach((userMsgs, index1) => {
    userMsgs.forEach((msg, index2) => {
      const ownerAddress = msg.mint.owner;
      nfts.push({
        name: msg.mint.extension.name,
        token_id: msg.mint.token_id,
        owner_address: ownerAddress,
        contract_address: collectionByOwnerAddress[ownerAddress].contract_address,
        metadata: msg.mint.extension,
        sync_tx_id: insertedSyncTxs[index1 * index2 + index2].id,
      });
    });
  });
  await knex('nfts').insert(nfts);
};
