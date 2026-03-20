const { setupBlockchainClient } = require('../tests/helpers/test-utility');
const chainConfig = require('../config/chain').defaultChain;

if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('DO NOT RUN IN PRODUCTION!!');
  throw new Error('production environment not supported');
}
const { faker } = require('@faker-js/faker');

const NO_HISTORIES = process.env.NO_HISTORIES || 10;

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('nft_histories').del();
  }

  const nftBeforeTransfer = await knex('nfts').first();
  const contractAddress = (
    await knex('collections').where({ contract_address: nftBeforeTransfer.contract_address }).first()
  ).contract_address;
  let senderAddress = nftBeforeTransfer.owner_address;
  const receiverAddresses = (await knex('users')).map((u) =>
    u.aura_address);

  const { client } = await setupBlockchainClient();

  const nftHistories = [];
  // transfer nft
  for (let i = 0; i < NO_HISTORIES; i += 1) {
    let index = faker.mersenne.rand(receiverAddresses.length);
    // chose to different address
    let receiverAddress = senderAddress === receiverAddresses[index]
      ? receiverAddresses[(index + 1) % receiverAddresses.length]
      : receiverAddresses[index];

    // transfer nft
    // eslint-disable-next-line no-await-in-loop
    const response = await client.execute(
      senderAddress,
      contractAddress,
      {
        transfer_nft: {
          recipient: receiverAddress,
          token_id: nftBeforeTransfer.token_id,
        },
      },
      'auto',
    );

    // eslint-disable-next-line no-await-in-loop
    await knex('nfts').update({ owner_address: receiverAddress }).where({ token_id: nftBeforeTransfer.token_id });

    nftHistories.push({
      transaction_hash: response.transactionHash,
      event: 'transfer_nft',
      price: {
        quantity: response.gasUsed,
        decimal: faker.mersenne.rand(response.gasUsed.toString().length),
        unit: chainConfig.denom,
        usd: response.gasUsed * 0.025 * 0.09,
      },
      from_address: senderAddress,
      to_address: receiverAddress,
      token_id: nftBeforeTransfer.token_id,
      transaction_time: new Date(),
      contract_address: contractAddress,
    });

    senderAddress = receiverAddress;
  }

  return knex('nft_histories').insert(nftHistories);
};
