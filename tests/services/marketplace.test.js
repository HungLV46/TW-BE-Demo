'use strict';

const { ServiceBroker } = require('moleculer');
const apiServiceSchema = require('@services/api.service');
const marketplaceServiceSchema = require('@services/marketplace.service');

const knex = require('@config/database');
const { Store, DeployedContract, StandardContract } = require('@models');

describe('Test marketplace', () => {
  let broker = new ServiceBroker({ logger: false });
  broker.createService(apiServiceSchema);
  broker.createService(marketplaceServiceSchema);

  beforeAll(async () => {
    if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
      await Promise.all([knex('deployed_contracts').del(), knex('stores').del()]);
    }

    await knex.seed.run({ specific: 'auction.seed.js' });
    await knex.seed.run({ specific: 'marketplace.seed.js' });
    await broker.start();
  });
  afterAll(async () => {
    await broker.stop();
  });

  describe('Test GET /marketplace/config', () => {
    it('Get success', async () => {
      // setup
      const cw2981Contract = await StandardContract.query()
        .where({ name: StandardContract.TYPES.CW2981, status: StandardContract.STATUSES.ACTIVE })
        .first();
      await DeployedContract.query().insert({
        contract_address: 'new contract address',
        standard_contract_id: cw2981Contract.id,
      }); // make bidding-token contract is not the last deployed

      // execute.
      const response = await broker.call('marketplace.config');

      // verify.
      const marketplace = await Store.query().where({ subdomain: 'aura', status: Store.STATUSES.ACTIVE }).first();
      const biddingTokenContract = await StandardContract.query()
        .where({ name: StandardContract.TYPES.BIDDING_TOKEN, status: StandardContract.STATUSES.ACTIVE })
        .first();
      const biddingTokenDeployedContract = await DeployedContract.query()
        .where({ standard_contract_id: biddingTokenContract.id })
        .orderBy('id', 'desc')
        .first();
      const auction = await Store.query().where({ subdomain: 'aura-auction', status: Store.STATUSES.ACTIVE }).first();
      expect(response).toMatchObject({
        marketplace_contract_address: marketplace.contract_address,
        auction_contract_address: auction.contract_address,
        bidding_token_contract_address: biddingTokenDeployedContract.contract_address,
      });
    });
  });
});
