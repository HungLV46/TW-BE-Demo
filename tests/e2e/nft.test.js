'use strict';

jest.mock('@helpers/social/discord');
jest.mock('@helpers/social/twitter');
jest.mock('@helpers/social/telegram');

const axios = require('axios').default;
jest.spyOn(axios, 'post');
const { getNftResponse } = require('../factories/horoscope/cw721_activities_response');

const { ServiceBroker } = require('moleculer');
const knex = require('@config/database');
const {
  SyncInformation, User, Collection, Nft
} = require('@models');

const NftServiceSchema = require('@services/nft.service');
const SyncDataServiceSchema = require('@services/sync_data.service');

const { setupBlockchainClient, sleep } = require('../helpers/test-utility');

const crypto = require('crypto');

describe('Test NFT', () => {
  let broker = new ServiceBroker({ logger: false });
  broker.createService(NftServiceSchema);
  broker.createService(SyncDataServiceSchema);

  let client;

  beforeAll(async () => {
    process.env.NO_USERS = 3;
    process.env.NO_COLLECTIONS = 2;

    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '03_collections.js' });

    const setup = await setupBlockchainClient(process.env.NO_USERS);
    client = setup.client;

    await broker.start();
  }, 200000);
  afterAll(async () => {
    await broker.stop();
  });

  beforeEach(async () => {
    // skip sync previous block
    const latestBlock = await client.getBlock();
    await SyncInformation.query().where({ key: 'last-block-synced' }).patch({ height: latestBlock.header.height });
  });

  describe('Test resync nft', () => {
    it('Resync success', async () => {
      // setup.
      const users = await User.query();
      const collection = await Collection.query().first();
      const contractAddress = collection.contract_address;
      const tokenId = crypto.randomBytes(32).toString('base64');

      // mint nft
      const mintMessage = {
        mint: {
          owner: users[0].aura_address,
          token_id: tokenId,
          extension: {
            name: 'name',
            image: 'ipfs://cid/image.png',
            animation_url: 'ipfs://cid/animation.png',
            external_url: 'https://external.com',
            description: 'description',
            attributes: [
              { trait_type: 'trait1', value: 'value1' },
              { trait_type: 'trait2', value: 'value2' },
            ],
            background_color: 'EdeD88',
          },
        },
      };
      await client.execute(collection.minter_address, contractAddress, mintMessage, 'auto');

      // mock horoscope response
      const horoscopeNftResponse = await getNftResponse({
        contract_address: collection.contract_address,
        token_id: tokenId,
        attributes: mintMessage.mint.extension.attributes,
        owner: collection.owner_address,
        name: mintMessage.mint.extension.name,
      });
      axios.post.mockImplementationOnce(() =>
        Promise.resolve(horoscopeNftResponse));

      // execute.
      await broker.call('nft.resync', { contract_address: contractAddress, token_id: tokenId });
      await sleep(2000);

      // verify.
      const nft = await Nft.query().where({ contract_address: contractAddress, token_id: tokenId }).first();
      expect(nft).toMatchObject({
        name: mintMessage.mint.extension.name,
        token_id: tokenId,
        metadata: {
          ...horoscopeNftResponse.data.data.test_database.cw721_token[0].media_info.onchain.metadata,
          s3_image: horoscopeNftResponse.data.data.test_database.cw721_token[0].media_info.offchain.image.url,
          s3_animation: horoscopeNftResponse.data.data.test_database.cw721_token[0].media_info.offchain.animation.url,
          royalty_percentage: collection.royalty_percentage,
          royalty_payment_address: collection.royalty_payment_address,
        },
        owner_address: mintMessage.mint.owner,
        contract_address: contractAddress,
        token_uri: null,
      });
    }, 100000);
  });
});
