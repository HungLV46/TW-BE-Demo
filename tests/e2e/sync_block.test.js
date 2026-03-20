jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3: class S3 {
      // eslint-disable-next-line class-methods-use-this
      send() {}

      // eslint-disable-next-line class-methods-use-this
      headObject() {}
    },
    PutObjectCommand: class PutObjectCommand {},
  };
});

const axios = require('axios').default;
jest.spyOn(axios, 'post');
const { createSuccessResponse, getNftResponse } = require('../factories/horoscope/cw721_activities_response');

const { ServiceBroker } = require('moleculer');

const knex = require('@config/database');
const {
  Nft, User, Collection, SyncInformation, NftHistory
} = require('@models');
const ApiServiceSchema = require('@services/api.service');
const NftServiceSchema = require('@services/nft.service');
const SyncDataServiceSchema = require('@services/sync_data.service');

const { sleep, setupBlockchainClient, getRoundedDateForTesting } = require('../helpers/test-utility');

const { create } = require('ipfs-http-client');
const crypto = require('crypto');
const _ = require('lodash');

jest.setTimeout(30000);

describe("Test 'sync_block'", () => {
  let broker = new ServiceBroker({ logger: false });
  broker.createService(ApiServiceSchema);
  const nftService = broker.createService(NftServiceSchema);
  broker.createService(SyncDataServiceSchema);

  let client;

  beforeAll(async () => {
    process.env.NO_USERS = 2;
    process.env.NO_COLLECTIONS = 1;
    process.env.NO_NFTS = 1;
    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '03_collections.js' });
    await knex.seed.run({ specific: '05_nfts.js' });

    const setup = await setupBlockchainClient(process.env.NO_USERS);
    client = setup.client;
    ipfs = create({ url: process.env.IPFS_GATEWAY });

    await broker.start();
  }, 150000);

  beforeEach(async () => {
    // skip sync previous block
    const latestBlock = await client.getBlock();
    await SyncInformation.query().where({ key: 'last-block-synced' }).patch({ height: latestBlock.header.height });
  });

  afterAll(async () => {
    await broker.stop();
  });

  describe('Test mint NFT', () => {
    it('Can sync minted NFT', async () => {
      const collection = await Collection.query().orderBy('id').first();
      await collection.$query().update({
        metadata: {
          ...collection.metadata,
          royalty_percentage: null,
          royalty_payment_address: null,
        },
      });
      const tokenId = crypto.randomBytes(32).toString('base64');
      const minterAddress = collection.owner_address;
      const contractAddress = collection.contract_address;

      await client.execute(
        minterAddress,
        contractAddress,
        { mint: { owner: minterAddress, token_id: tokenId, extension: { name: 'a new NFT' } } },
        'auto',
      );

      const horoscopeNftResponse = await getNftResponse({
        contract_address: collection.contract_address,
        token_id: tokenId,
        attributes: [],
        owner: collection.owner_address,
      });

      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post
        .mockImplementationOnce(() =>
          createSuccessResponse([
            {
              id: parseInt(syncInformation.query) + 1,
              action: 'mint',
              from: null,
              to: collection.owner_address,
              contract_address: collection.contract_address,
              token_id: tokenId,
              height: 1111,
              hash: 'hash1',
            },
          ]))
        .mockImplementationOnce(() =>
          Promise.resolve(horoscopeNftResponse));

      // execute.
      await nftService.syncNfts();
      await sleep(2000);

      // verify.
      const royaltyInfo = await client.queryContractSmart(collection.contract_address, {
        extension: { msg: { royalty_info: { token_id: tokenId, sale_price: '100' } } },
      });
      const updatedCollection = await Collection.query().where({ id: collection.id }).first();
      expect(updatedCollection.royalty_payment_address).toBe(collection.owner_address);
      expect(updatedCollection.royalty_percentage).toBe(parseInt(royaltyInfo.royalty_amount));

      const mintedNft = await Nft.query().where({ token_id: tokenId }).first();
      expect(mintedNft.owner_address).toBe(collection.owner_address);
      expect(mintedNft.metadata).toMatchObject({
        name: horoscopeNftResponse.data.data.test_database.cw721_token[0].media_info.onchain.metadata.name,
        s3_image: horoscopeNftResponse.data.data.test_database.cw721_token[0].media_info.offchain.image.url,
        s3_animation: horoscopeNftResponse.data.data.test_database.cw721_token[0].media_info.offchain.animation.url,
        royalty_percentage: parseInt(royaltyInfo.royalty_amount),
        royalty_payment_address: collection.owner_address,
      });

      const nftHistory = await NftHistory.query().where({ token_id: tokenId }).orderBy('id', 'desc').first();
      expect(nftHistory).toMatchObject({
        transaction_hash: 'hash1',
        event: 'mint',
        to_address: minterAddress,
        token_id: tokenId,
        transaction_time: expect.any(Date),
        contract_address: collection.contract_address,
        block_height: 1111,
      });
    });

    it('Re-Mint burned NFT', async () => {
      const collection = await Collection.query().orderBy('id').first();
      await collection.$query().update({
        metadata: {
          ...collection.metadata,
          royalty_percentage: null,
          royalty_payment_address: null,
        },
      });
      const tokenId = crypto.randomBytes(32).toString('base64');
      const minterAddress = collection.owner_address;
      const contractAddress = collection.contract_address;

      // prevent that a NFT has been burned
      await Nft.query().insert({
        contract_address: collection.contract_address,
        token_id: tokenId,
        metadata: { attributes: [] },
        owner: collection.owner_address,
        burned_at: new Date(),
      });

      await client.execute(
        minterAddress,
        contractAddress,
        { mint: { owner: minterAddress, token_id: tokenId, extension: { name: 'a new NFT' } } },
        'auto',
      );

      const horoscopeNftResponse = await getNftResponse({
        contract_address: collection.contract_address,
        token_id: tokenId,
        attributes: [],
        owner: collection.owner_address,
      });

      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post
        .mockImplementationOnce(() =>
          createSuccessResponse([
            {
              id: parseInt(syncInformation.query) + 1,
              action: 'mint',
              from: null,
              to: collection.owner_address,
              contract_address: collection.contract_address,
              token_id: tokenId,
              height: 1111,
              hash: 'hash1',
            },
          ]))
        .mockImplementationOnce(() =>
          Promise.resolve(horoscopeNftResponse));

      // execute.
      await nftService.syncNfts();
      await sleep(2000);

      // verify.
      const mintedNft = await Nft.query().where({ token_id: tokenId }).first();
      expect(mintedNft.burned_at).toBe(null);
    });
  });

  describe('Test transfer NFT', () => {
    it('Can sync transfered NFT', async () => {
      // setup.
      const nftBeforeTransfer = await Nft.query().first();
      const receiverAddress = (await User.query().whereNot('aura_address', nftBeforeTransfer.owner_address).first())
        .aura_address;

      // transfer nft
      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post.mockImplementation(() =>
        createSuccessResponse([
          {
            id: parseInt(syncInformation.query) + 1,
            action: 'transfer_nft',
            from: nftBeforeTransfer.owner_address,
            to: receiverAddress,
            contract_address: nftBeforeTransfer.contract_address,
            token_id: nftBeforeTransfer.token_id,
            height: 1111,
            hash: 'hash',
          },
        ]));

      // execute.
      await nftService.syncNfts();
      await sleep(2000);

      // verify.
      const nftAfterTransfer = await Nft.query().findById(nftBeforeTransfer.id);
      expect(nftAfterTransfer.owner_address).toBe(receiverAddress);

      const nftHistory = await NftHistory.query()
        .where({ token_id: nftBeforeTransfer.token_id })
        .orderBy('id', 'desc')
        .first();

      expect(nftHistory).toMatchObject({
        transaction_hash: 'hash',
        event: 'transfer_nft',
        from_address: nftBeforeTransfer.owner_address,
        to_address: receiverAddress,
        token_id: nftBeforeTransfer.token_id,
        transaction_time: expect.any(Date),
        contract_address: nftBeforeTransfer.contract_address,
        block_height: 1111,
      });
    });

    it('Can sync burn NFT', async () => {
      // setup.
      const nft = await Nft.query().first();

      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post.mockImplementation(() =>
        createSuccessResponse([
          {
            id: parseInt(syncInformation.query) + 1,
            action: 'burn',
            contract_address: nft.contract_address,
            token_id: nft.token_id,
          },
        ]));

      // execute.
      await nftService.syncNfts();
      await sleep(2000);

      // verify.
      // should not exist in nft table
      const nftAfterBurn = await Nft.query().findById(nft.id);
      expect(nftAfterBurn.burned_at).not.toBeNull();
    });
  });
});
