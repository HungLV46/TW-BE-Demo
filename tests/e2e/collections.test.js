'use strict';

jest.mock('@helpers/social/discord');
jest.mock('@helpers/social/twitter');
jest.mock('@helpers/social/telegram');

const { ServiceBroker } = require('moleculer');
const knex = require('@config/database');
const {
  StandardContract, DeployedContract, User, Collection, SyncInformation, Launchpad
} = require('@models');

const CollectionServiceSchema = require('@services/collections.service');
const NftServiceSchema = require('@services/nft.service');
const SyncDataServiceSchema = require('@services/sync_data.service');
const LaunchpadServiceSchema = require('@services/launchpad.service');
const DiscordClient = require('@helpers/social/discord');

const chainConfig = require('@config/chain').defaultChain;
const { setupBlockchainClient } = require('../helpers/test-utility');
const { instantiateContract } = require('@helpers/blockchain_utils');

const { createLaunchpadData } = require('../factories/launchpad');

const crypto = require('crypto');

describe('Test collection', () => {
  DiscordClient.checkContainsAdminPermission = () =>
    true; // mock checkContainsAdminPermission function
  let broker = new ServiceBroker({ logger: false });
  broker.createService(CollectionServiceSchema);
  broker.createService(NftServiceSchema);
  broker.createService(SyncDataServiceSchema);
  broker.createService(LaunchpadServiceSchema);

  let wallet;
  let client;

  beforeAll(async () => {
    process.env.NO_USERS = 3;
    process.env.NO_COLLECTIONS = 2;

    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '03_collections.js' });

    const setup = await setupBlockchainClient(process.env.NO_USERS);
    wallet = setup.wallet;
    client = setup.client;

    await broker.start();
  }, 200000);

  beforeEach(async () => {
    // skip sync previous block
    const latestBlock = await client.getBlock();
    await SyncInformation.query().where({ key: 'last-block-synced' }).patch({ height: latestBlock.header.height });
  });

  afterAll(async () => {
    await broker.stop();
  });
  describe('Test sync-instantiation', () => {
    it('Resync success', async () => {
      // setup.
      const cw2981 = await StandardContract.query().where({ name: StandardContract.TYPES.CW2981 }).first();
      const users = await User.query();

      // instantiate collection
      const instantiateMessage = {
        name: 'abc xxx',
        symbol: 'symbol',
        minter: users[0].aura_address,
        royalty_percentage: 7,
        royalty_payment_address: users[1].aura_address,
        creator: users[2].aura_address,
      };
      const instantiateResponse = await instantiateContract(cw2981.code_id, wallet, instantiateMessage, chainConfig);
      const contractAddress = instantiateResponse.contractAddress;

      // mint nft
      const mintMessage = {
        mint: {
          owner: instantiateMessage.minter,
          token_id: crypto.randomBytes(32).toString('base64'),
          extension: {
            name: 'a new NFT',
          },
        },
      };
      await client.execute(instantiateMessage.minter, contractAddress, mintMessage, 'auto');

      // execute.
      await broker.call('collection.resync', { contract_address: contractAddress });

      // verify.
      const deployedContract = await DeployedContract.query().where({ contract_address: contractAddress }).first();
      expect(deployedContract).toMatchObject({
        standard_contract_id: cw2981.id,
        contract_address: contractAddress,
      });

      const collection = await Collection.query().where({ contract_address: contractAddress }).first();
      expect(collection).toMatchObject({
        name: 'abc xxx',
        symbol: 'symbol',
        slug: 'abc-xxx-' + collection.id,
        contract_address: contractAddress,
        standard_contract_id: cw2981.id,
        minter_address: instantiateMessage.minter,
        owner_address: (await wallet.getAccounts())[0].address,
        royalty_percentage: instantiateMessage.royalty_percentage,
        royalty_payment_address: instantiateMessage.royalty_payment_address,
        verified_at: null,
      });
    }, 50000);

    it('Resync launchpad collection', async () => {
      // setup.
      const launchpad = await Launchpad.query().insert(await createLaunchpadData());
      await broker.call('launchpad.deploy', { launchpad_id: launchpad.id });
      const deployedLaunchpad = await launchpad.$query().first();

      // execute.
      await broker.call('collection.resync', { contract_address: deployedLaunchpad.collection_address });

      // verify.
      const deployedCollection = await Collection.query()
        .where({ contract_address: deployedLaunchpad.collection_address })
        .first();
      const cw2981 = await StandardContract.getActive(StandardContract.TYPES.CW2981);
      expect(deployedCollection).toMatchObject({
        name: launchpad.collection_information.name,
        symbol: launchpad.collection_information.symbol,
        contract_address: deployedLaunchpad.collection_address,
        standard_contract_id: cw2981.id,
        description: launchpad.collection_information.description,
        logo: launchpad.collection_information.logo,
        feature: launchpad.collection_information.feature,
        banner: launchpad.collection_information.banner,
        minter_address: deployedLaunchpad.contract_address,
        owner_address: launchpad.collection_information.creator,
        metadata: null,
        slug: deployedCollection.generateSlug(launchpad.collection_information.name),
        type: launchpad.collection_information.category,
        website: launchpad.collection_information.website,
        royalty_percentage: launchpad.collection_information.royalty_percentage,
        royalty_payment_address: launchpad.collection_information.royalty_payment_address,
      });
    }, 50000);
  });
});
