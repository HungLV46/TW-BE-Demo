/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
const { faker } = require('@faker-js/faker');
const dayjs = require('dayjs');

const NO_OFFERS = process.env.NO_OFFERS || 10;

exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('offers').del();

  // TODO: For now, we will just add associate offers with some random users
  // after we have the offer contract, we will make transaction to add offers
  // then, we will use rely on synchronization service to add offers to the database

  // get all users
  const users = await knex('users').select('id', 'aura_address');

  // get all nfts
  const nfts = await knex('nfts').select('id', 'contract_address', 'token_id');

  // get marketplace contract
  const marketplace = await knex('stores').where({ subdomain: 'aura', status: 'active' }).first();

  const offers = [];
  for (let i = 0; i < NO_OFFERS; i += 1) {
    const nft = nfts[faker.mersenne.rand(0, nfts.length - 1)];
    offers.push({
      // take a random user from the list
      offerer_address: users[Math.floor(Math.random() * users.length)].aura_address,
      token_id: nft.token_id,
      contract_address: nft.contract_address,
      store_address: marketplace.contract_address,
      status: 'active',
      price: {
        denome: 'aura',
        amount: '1000000000000000000',
      },
      end_time: dayjs().add(10, 'day'),
    });
  }
  await knex('offers').insert(offers);
};
