const SyncDataServiceSchema = require('@services/sync_data.service');
const NftServiceSchema = require('@services/nft.service');
const {
  Collection,
  CollectionStat,
  SyncInformation,
  Nft,
  NftAttribute,
  Listing,
  NftHistory,
  Store,
  User,
  Launchpad,
  StandardContract,
} = require('@models');
const { setupBlockchainClient, sleep } = require('../helpers/test-utility');
const knex = require('@config/database');
const dayjs = require('dayjs');

const { ServiceBroker } = require('moleculer');
const crypto = require('crypto');
const _ = require('lodash');

const axios = require('axios').default;
jest.spyOn(axios, 'post');
const { createSuccessResponse, getNftResponse } = require('../factories/horoscope/cw721_activities_response');
const MintPhase = require('../../app/models/mint_phase');

/**
 * Change order of original object.
 *
 * @param {*} metadata
 */
function sortCollectionMetadata(metadata) {
  if (_.isEmpty(metadata) || _.isEmpty(metadata.attributes)) throw Error('nothing to sort');

  // sort metadata.attributes[]
  metadata.attributes.sort((att1, att2) => {
    const traitTypeComparision = att1.trait_type.localeCompare(att2.trait_type);

    return traitTypeComparision !== 0 ? traitTypeComparision : att1.display_type.localeCompare(att2.display_type);
  });

  // sort metadata.attributes[].values[]
  metadata.attributes.forEach((attribute) => {
    attribute.values.sort((v1, v2) =>
      v1[0].localeCompare(v2[0]));
  });

  return metadata;
}

describe("Test 'sync_data'", () => {
  let broker = new ServiceBroker({ logger: false });
  const nftService = broker.createService(NftServiceSchema);
  const syncDataService = broker.createService(SyncDataServiceSchema);

  let client;
  let marketplace;

  beforeAll(async () => {
    process.env.NO_USERS = 3;
    process.env.NO_COLLECTIONS = 4;
    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '03_collections.js' });
    await knex.seed.run({ specific: '09_marketplace.js' });

    marketplace = await Store.query().findOne({ subdomain: 'aura', status: Store.STATUSES.ACTIVE });
    const setup = await setupBlockchainClient(process.env.NO_USERS);
    client = setup.client;

    await broker.start();
  }, 150000);

  beforeEach(async () => {
    await Nft.query().del();
    await NftAttribute.query().del();
    await NftHistory.query().del();
    await CollectionStat.query().del();
    await Listing.query().del();

    // skip sync previous block
    const latestBlock = await client.getBlock();
    await SyncInformation.query().where({ key: 'last-block-synced' }).patch({ height: latestBlock.header.height });
  });

  afterAll(async () => {
    await broker.stop();

    await Nft.query().del();
    await NftAttribute.query().del();
    await NftHistory.query().del();
    await CollectionStat.query().del();
    await Listing.query().del();
  });

  describe('Test update collection metadata based on ONE NFT', () => {
    it('Update success, default mode = add', async () => {
      // setup.
      const collections = await Collection.query().orderBy('id');
      const tokenIds = _.range(0, 4).map(() =>
        crypto.randomBytes(32).toString('base64'));

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
              to: collections[0].owner_address,
              contract_address: collections[0].contract_address,
              token_id: tokenIds[0],
              height: 1111,
              hash: 'hash1',
            },
            {
              id: parseInt(syncInformation.query) + 2,
              action: 'mint',
              from: null,
              to: collections[0].owner_address,
              contract_address: collections[0].contract_address,
              token_id: tokenIds[1],
              height: 1112,
              hash: 'hash2',
            },
            {
              id: parseInt(syncInformation.query) + 3,
              action: 'mint',
              from: null,
              to: collections[2].owner_address,
              contract_address: collections[2].contract_address,
              token_id: tokenIds[2],
              height: 1113,
              hash: 'hash3',
            },
            {
              id: parseInt(syncInformation.query) + 4,
              action: 'mint',
              from: null,
              to: collections[3].owner_address,
              contract_address: collections[3].contract_address,
              token_id: tokenIds[3],
              height: 1114,
              hash: 'hash4',
            },
          ]))
        .mockImplementationOnce(() =>
          getNftResponse({
            contract_address: collections[0].contract_address,
            token_id: tokenIds[0],
            attributes: [
              { trait_type: 'trait_type_1', value: 'value_1' },
              { trait_type: 'trait_type_2', value: 'value_2' },
              { trait_type: 'trait_type_1', value: 'value_2' },
              { trait_type: 'trait_type_2', value: 'value_3' },
              { trait_type: 'trait_type_1', value: 'value_1' },
              { trait_type: 'trait_type_3', value: 'value_1' },
              { trait_type: 'trait_type_1', display_type: 'number', value: '3' },
            ],
            owner: collections[0].owner_address,
          }))
        .mockImplementationOnce(() =>
          getNftResponse({
            contract_address: collections[0].contract_address,
            token_id: tokenIds[1],
            attributes: [
              { trait_type: 'trait_type_1', value: 'value_1' },
              { trait_type: 'trait_type_2', value: 'value_2' },
              { trait_type: 'trait_type_1', display_type: 'number', value: '2' },
              { trait_type: 'trait_type_2', value: 'value_3' },
              { trait_type: 'trait_type_1', value: 'value_5' },
            ],
            owner: collections[0].owner_address,
          }))
        .mockImplementationOnce(() =>
          getNftResponse({
            contract_address: collections[2].contract_address,
            token_id: tokenIds[2],
            attributes: [
              { trait_type: 'trait_type_1', value: 'value_4' },
              { trait_type: 'trait_type_2', display_type: 'number', value: '1' },
            ],
            owner: collections[2].owner_address,
          }))
        .mockImplementationOnce(() =>
          getNftResponse({
            contract_address: collections[3].contract_address,
            token_id: tokenIds[3],
            attributes: [],
            owner: collections[3].owner_address,
          }));

      // execute.
      await nftService.syncNfts();
      await sleep(2000);

      // verify collection attributes.
      const collectionsAfterUpdate = await Collection.query().whereNotDeleted().orderBy('id');
      expect(sortCollectionMetadata(collectionsAfterUpdate[0].metadata)).toMatchObject(
        sortCollectionMetadata({
          attributes: [
            {
              trait_type: 'trait_type_1',
              display_type: 'string',
              values: [
                ['value_1', 3],
                ['value_2', 1],
                ['value_5', 1],
              ],
            },
            {
              trait_type: 'trait_type_2',
              display_type: 'string',
              values: [
                ['value_2', 2],
                ['value_3', 2],
              ],
            },
            {
              trait_type: 'trait_type_3',
              display_type: 'string',
              values: [['value_1', 1]],
            },
            {
              trait_type: 'trait_type_1',
              display_type: 'number',
              values: [
                ['3', 1],
                ['2', 1],
              ],
            },
          ],
        }),
      );
      expect(collectionsAfterUpdate[1].metadata).toBeNull();
      expect(sortCollectionMetadata(collectionsAfterUpdate[2].metadata)).toMatchObject(
        sortCollectionMetadata({
          attributes: [
            {
              trait_type: 'trait_type_1',
              display_type: 'string',
              values: [['value_4', 1]],
            },
            {
              trait_type: 'trait_type_2',
              display_type: 'number',
              values: [['1', 1]],
            },
          ],
        }),
      );
      expect(collectionsAfterUpdate[3].metadata).toBeNull();

      // verify nft attribute.
      const nftAttributes = await NftAttribute.query().orderBy(['collection_id', 'nft_id', 'id']);
      const nfts = await Nft.query().orderBy('id');

      expect(nftAttributes).toMatchObject([
        {
          collection_id: collections[0].id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_2',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_2',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_3',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_3',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_1',
          display_type: 'number',
          numeric_value: '3.000000',
        },

        {
          collection_id: collections[0].id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_2',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'number',
          numeric_value: '2.000000',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_3',
        },
        {
          collection_id: collections[0].id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_5',
        },

        {
          collection_id: collections[2].id,
          nft_id: nfts[2].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_4',
        },
        {
          collection_id: collections[2].id,
          nft_id: nfts[2].id,
          trait_type: 'trait_type_2',
          display_type: 'number',
          numeric_value: '1.000000',
        },
      ]);
    }, 100000);

    it('Update success, mode = substract', async () => {
      // setup.
      const collection = await Collection.query().orderBy('id').first();
      await collection.$query().patch({
        metadata: {
          attributes: [
            {
              trait_type: 'trait_type_1',
              display_type: 'string',
              values: [
                ['value_1', 3],
                ['value_2', 1],
                ['value_5', 1],
              ],
            },
            {
              trait_type: 'trait_type_2',
              display_type: 'string',
              values: [
                ['value_2', 2],
                ['value_3', 2],
              ],
            },
            {
              trait_type: 'trait_type_3',
              display_type: 'string',
              values: [['value_1', 1]],
            },
            {
              trait_type: 'trait_type_1',
              display_type: 'number',
              values: [
                ['3', 1],
                ['2', 1],
              ],
            },
          ],
        },
      });
      const nft = await Nft.query()
        .insert({
          contract_address: collection.contract_address,
          token_id: crypto.randomBytes(32).toString('base64'),
          metadata: {
            attributes: [
              { trait_type: 'trait_type_1', value: 'value_1' },
              { trait_type: 'trait_type_2', value: 'value_2' },
              { trait_type: 'trait_type_1', value: 'value_2' },
              { trait_type: 'trait_type_2', value: 'value_3' },
              { trait_type: 'trait_type_1', value: 'value_1' },
              { trait_type: 'trait_type_3', value: 'value_1' },
              { trait_type: 'trait_type_1', display_type: 'number', value: '3' },
            ],
          },
          owner: collection.owner_address,
        })
        .returning('*');

      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post.mockImplementationOnce(() =>
        createSuccessResponse([
          {
            id: parseInt(syncInformation.query) + 1,
            action: 'burn',
            from: collection.owner_address,
            to: null,
            contract_address: collection.contract_address,
            token_id: nft.token_id,
            height: 1111,
            hash: 'hash1',
          },
        ]));

      // execute.
      await nftService.syncNfts();
      await sleep(2000);

      // verify collection attributes.
      const collectionsAfterUpdate = await collection.$query().first();
      expect(sortCollectionMetadata(collectionsAfterUpdate.metadata)).toMatchObject(
        sortCollectionMetadata({
          attributes: [
            {
              trait_type: 'trait_type_1',
              display_type: 'string',
              values: [
                ['value_1', 1],
                ['value_5', 1],
              ],
            },
            {
              trait_type: 'trait_type_2',
              display_type: 'string',
              values: [
                ['value_2', 1],
                ['value_3', 1],
              ],
            },
            {
              trait_type: 'trait_type_1',
              display_type: 'number',
              values: [['2', 1]],
            },
          ],
        }),
      );

      // verify nft attribute.
      const nftAttributes = await NftAttribute.query().where({ nft_id: nft.id });
      expect(nftAttributes.length).toBe(0);
    }, 100000);
  });

  describe('Test update collection metadata based on all its NFT', () => {
    it('update success', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();
      const nfts = await knex('nfts')
        .insert([
          {
            name: 'name_1',
            contract_address: collection.contract_address,
            token_id: 'token_id_1',
            metadata: {
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_1', value: 'value_2' },
                { trait_type: 'trait_type_2', value: 'value_3' },
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_3', value: 'value_1' },
                { trait_type: 'trait_type_1', display_type: 'number', value: '3' },
              ],
            },
          },
          {
            name: 'name_2',
            contract_address: collection.contract_address,
            token_id: 'token_id_2',
            metadata: {
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_1', display_type: 'number', value: '2' },
                { trait_type: 'trait_type_2', value: 'value_3' },
                { trait_type: 'trait_type_1', value: 'value_5' },
              ],
            },
          },
        ])
        .returning(knex.raw('*'));

      // execute.
      await broker.call('sync-data.updateCollectionMetadataByContractAddress', {
        contract_address: collection.contract_address,
      });

      // verify.
      const collectionAfterUpdate = await collection.$query();
      expect(sortCollectionMetadata(collectionAfterUpdate.metadata)).toMatchObject(
        sortCollectionMetadata({
          attributes: [
            {
              trait_type: 'trait_type_1',
              display_type: 'string',
              values: [
                ['value_1', 3],
                ['value_2', 1],
                ['value_5', 1],
              ],
            },
            {
              trait_type: 'trait_type_2',
              display_type: 'string',
              values: [
                ['value_2', 2],
                ['value_3', 2],
              ],
            },
            {
              trait_type: 'trait_type_3',
              display_type: 'string',
              values: [['value_1', 1]],
            },
            {
              trait_type: 'trait_type_1',
              display_type: 'number',
              values: [
                ['3', 1],
                ['2', 1],
              ],
            },
          ],
        }),
      );

      // verify nft attribute.
      const nftAttributes = await NftAttribute.query()
        .where({ collection_id: collection.id })
        .orderBy(['nft_id', 'id']);

      expect(nftAttributes).toMatchObject([
        {
          collection_id: collection.id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_2',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_2',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_3',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_3',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[0].id,
          trait_type: 'trait_type_1',
          display_type: 'number',
          numeric_value: '3.000000',
        },

        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_2',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'number',
          numeric_value: '2.000000',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_3',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_5',
        },
      ]);
    }, 100000);

    it('collection have zero NFT', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      // execute.
      await broker.call('sync-data.updateCollectionMetadataByContractAddress', {
        contract_address: collection.contract_address,
      });

      // verify collection attributes.
      const collectionAfterUpdate = await collection.$query();
      expect(collectionAfterUpdate.metadata).toMatchObject({ attributes: [] });

      // verify nft attributes.
      const nftAttributes = await NftAttribute.query().where({ collection_id: collection.id });
      expect(nftAttributes).toMatchObject([]);
    });

    it('collection have a NFT without attributes', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();
      await Nft.query().insert({
        name: 'name_1',
        contract_address: collection.contract_address,
        token_id: 'token_id_1',
        metadata: {
          attributes: [],
        },
      });

      // execute.
      await broker.call('sync-data.updateCollectionMetadataByContractAddress', {
        contract_address: collection.contract_address,
      });

      // verify collection attributes.
      const collectionAfterUpdate = await collection.$query();
      expect(collectionAfterUpdate.metadata).toMatchObject({ attributes: [] });

      // verify nft attributes.
      const nftAttributes = await NftAttribute.query().where({ collection_id: collection.id });
      expect(nftAttributes).toMatchObject([]);
    });

    it('Update correct with burned NFTs', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();
      const nfts = await Nft.query()
        .insertGraph([
          {
            name: 'name_1',
            contract_address: collection.contract_address,
            token_id: 'token_id_1',
            metadata: {
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_1', value: 'value_2' },
                { trait_type: 'trait_type_2', value: 'value_3' },
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_3', value: 'value_1' },
                { trait_type: 'trait_type_1', display_type: 'number', value: '3' },
              ],
            },
          },
          {
            name: 'name_2',
            contract_address: collection.contract_address,
            token_id: 'token_id_2',
            metadata: {
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_1', display_type: 'number', value: '2' },
                { trait_type: 'trait_type_2', value: 'value_3' },
                { trait_type: 'trait_type_1', value: 'value_5' },
              ],
            },
          },
        ])
        .returning(knex.raw('*'));

      await broker.call('sync-data.updateCollectionMetadataByContractAddress', {
        contract_address: collection.contract_address,
      });
      await nfts[0].$query().patch({ burned_at: new Date() });

      // execute.
      await broker.call('sync-data.updateCollectionMetadataByContractAddress', {
        contract_address: collection.contract_address,
      });

      // verify.
      const collectionAfterUpdate = await collection.$query();
      expect(sortCollectionMetadata(collectionAfterUpdate.metadata)).toMatchObject(
        sortCollectionMetadata({
          attributes: [
            {
              trait_type: 'trait_type_1',
              display_type: 'string',
              values: [
                ['value_1', 1],
                ['value_5', 1],
              ],
            },
            {
              trait_type: 'trait_type_2',
              display_type: 'string',
              values: [
                ['value_2', 1],
                ['value_3', 1],
              ],
            },
            {
              trait_type: 'trait_type_1',
              display_type: 'number',
              values: [['2', 1]],
            },
          ],
        }),
      );

      // verify nft attribute.
      const nftAttributes = await NftAttribute.query()
        .where({ collection_id: collection.id })
        .orderBy(['nft_id', 'id']);

      expect(nftAttributes).toMatchObject([
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_1',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_2',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'number',
          numeric_value: '2.000000',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_2',
          display_type: 'string',
          string_value: 'value_3',
        },
        {
          collection_id: collection.id,
          nft_id: nfts[1].id,
          trait_type: 'trait_type_1',
          display_type: 'string',
          string_value: 'value_5',
        },
      ]);
    });
  });

  describe('Test update NFT statistic', () => {
    it('Update stat success', async () => {
      // setup.
      const collections = await Collection.query().whereNotDeleted();

      // create nfts.
      const nftData = Array.from({ length: 8 }, (x, i) =>
        ({
          name: `nft${i}`,
          token_id: crypto.randomBytes(32).toString('base64'),
          metadata: {
            name: `nft${i}`,
            attributes: [],
          },
          owner_address: collections[0].owner_address,
          contract_address: collections[0].contract_address,
        }));
      for (let i = 3; i < nftData.length; i += 1) {
        nftData[i].owner_address = collections[1].owner_address;
        nftData[i].contract_address = collections[1].contract_address;
      }
      await knex('nfts').insert(nftData).returning(knex.raw('*'));

      // create nft_histories.
      const nftHistoryData = Array.from({ length: 8 }, (x, i) =>
        ({
          token_id: nftData[i].token_id,
          event: NftHistory.EVENTS.BUY,
          price: JSON.stringify({ denom: 'aura', amount: '2' }),
          contract_address: nftData[i].contract_address,
          transaction_time: dayjs(),
        }));
      // prepare data for testing time frame
      nftHistoryData[3].transaction_time = dayjs().subtract(1, 'hour'); // > 1 hour old data
      nftHistoryData[4].transaction_time = dayjs().subtract(1, 'day'); // > 1 day old data
      nftHistoryData[6].transaction_time = dayjs().subtract(7, 'day'); // > 1 week old data
      nftHistoryData[7].transaction_time = dayjs().subtract(1, 'month'); // > 1 month old data

      nftHistoryData[5].event = NftHistory.EVENTS.MINT; // test the caculation of volume counts only event BUY
      await knex('nft_histories').insert(nftHistoryData);

      // create listing.
      const listingData = Array.from({ length: 8 }, (x, i) =>
        ({
          buyer_address: '',
          store_address: marketplace.contract_address,
          contract_address: nftData[i].contract_address,
          token_id: nftData[i].token_id,
          status: i < 4 ? Listing.STATUSES.SUCCEEDED : Listing.STATUSES.ONGOING,
          auction_config: {},
          latest_price: i + 1,
        }));
      await knex('listings').insert(listingData);

      // execute.
      await syncDataService.updateCollectionStats();

      // verify.
      // data ALL
      await sleep(2000);
      let collectionStat1 = await CollectionStat.query()
        .where('contract_address', collections[0].contract_address)
        .where('duration_type', CollectionStat.DURATION_TYPES.ALL)
        .first();
      expect(collectionStat1).toMatchObject({
        contract_address: collections[0].contract_address,
        duration_type: CollectionStat.DURATION_TYPES.ALL,
        floor_price: null,
        volume: '6',
        sales: 3,
        total_owners: 1,
        total_nfts: 3,
      });

      let collectionStat2 = await CollectionStat.query()
        .where('contract_address', collections[1].contract_address)
        .where('duration_type', CollectionStat.DURATION_TYPES.ALL)
        .first();
      expect(collectionStat2).toMatchObject({
        contract_address: collections[1].contract_address,
        duration_type: CollectionStat.DURATION_TYPES.ALL,
        floor_price: '5',
        volume: '8',
        sales: 4,
        total_owners: 1,
        total_nfts: 5,
      });

      // // data HOUR
      // collectionStat2 = await CollectionStat.query()
      //   .where('contract_address', collections[1].contract_address)
      //   .where('duration_type', CollectionStat.DURATION_TYPES.HOUR)
      //   .first();
      // expect(collectionStat2).toMatchObject({
      //   contract_address: collections[1].contract_address,
      //   duration_type: CollectionStat.DURATION_TYPES.HOUR,
      //   floor_price: null,
      //   volume: null,
      //   prev_volume: '2',
      //   sales: 0,
      //   total_owners: null,
      //   total_nfts: null,
      // });

      // // data DAY
      // collectionStat2 = await CollectionStat.query()
      //   .where('contract_address', collections[1].contract_address)
      //   .where('duration_type', CollectionStat.DURATION_TYPES.DAY)
      //   .first();
      // expect(collectionStat2).toMatchObject({
      //   contract_address: collections[1].contract_address,
      //   duration_type: CollectionStat.DURATION_TYPES.DAY,
      //   floor_price: null,
      //   volume: '2',
      //   prev_volume: '2',
      //   sales: 1,
      //   total_owners: null,
      //   total_nfts: null,
      // });

      // // data WEEK
      // collectionStat2 = await CollectionStat.query()
      //   .where('contract_address', collections[1].contract_address)
      //   .where('duration_type', CollectionStat.DURATION_TYPES.WEEK)
      //   .first();
      // expect(collectionStat2).toMatchObject({
      //   contract_address: collections[1].contract_address,
      //   duration_type: CollectionStat.DURATION_TYPES.WEEK,
      //   floor_price: null,
      //   volume: '4',
      //   prev_volume: '2',
      //   sales: 2,
      //   total_owners: null,
      //   total_nfts: null,
      // });

      // // data MONTH
      // collectionStat2 = await CollectionStat.query()
      //   .where('contract_address', collections[1].contract_address)
      //   .where('duration_type', CollectionStat.DURATION_TYPES.MONTH)
      //   .first();
      // expect(collectionStat2).toMatchObject({
      //   contract_address: collections[1].contract_address,
      //   duration_type: CollectionStat.DURATION_TYPES.MONTH,
      //   floor_price: null,
      //   volume: '6',
      //   prev_volume: '2',
      //   sales: 3,
      //   total_owners: null,
      //   total_nfts: null,
      // });

      // update stats
      // setup.
      await knex('listings').insert({
        buyer_address: '',
        store_address: marketplace.contract_address,
        contract_address: nftData[4].contract_address,
        token_id: nftData[4].token_id,
        status: Listing.STATUSES.ONGOING,
        auction_config: {},
        latest_price: 2,
      });

      // execute.
      await syncDataService.updateCollectionStats();

      // verify. Update floor price.
      await sleep(1000);
      collectionStat2 = await CollectionStat.query()
        .where('contract_address', collections[1].contract_address)
        .where('duration_type', CollectionStat.DURATION_TYPES.ALL)
        .first();
      expect(collectionStat2).toMatchObject({
        contract_address: collections[1].contract_address,
        duration_type: CollectionStat.DURATION_TYPES.ALL,
        floor_price: '2',
        volume: '8',
        sales: 4,
        total_owners: 1,
        total_nfts: 5,
      });
    }, 100000);

    it('Update stat success - max mint price', async () => {
      // setup.
      const collections = await Collection.query().whereNotDeleted();
      const launchpadContract = await StandardContract.query()
        .where({
          name: StandardContract.TYPES.LAUNCHPAD,
          status: StandardContract.STATUSES.ACTIVE,
        })
        .first();
      const currentDate = dayjs();
      await Launchpad.query().insertGraph([
        {
          collection_address: collections[0].contract_address,
          standard_contract_id: launchpadContract.id,
          mintPhases: [
            {
              config: {
                price: {
                  denom: 'uaura',
                  amount: '1',
                },
              },
              starts_at: currentDate.subtract(10, 'seconds'),
              type: MintPhase.TYPE.PUBLIC,
            },
            {
              config: {
                price: {
                  denom: 'uaura',
                  amount: '6',
                },
              },
              starts_at: currentDate.subtract(7, 'seconds'),
              type: MintPhase.TYPE.WHITELIST,
            },
            {
              config: {
                price: {
                  denom: 'uaura',
                  amount: '7',
                },
              },
              starts_at: currentDate.subtract(6, 'seconds'),
              type: MintPhase.TYPE.PUBLIC,
            },
            {
              config: {
                price: {
                  denom: 'uaura',
                  amount: '4',
                },
              },
              starts_at: currentDate.subtract(5, 'seconds'),
              type: MintPhase.TYPE.WHITELIST,
            },
            {
              config: {
                price: {
                  denom: 'uaura',
                  amount: '100',
                },
              },
              starts_at: currentDate.add(100, 'seconds'),
              type: MintPhase.TYPE.PUBLIC,
            },
          ],
        },
        {
          collection_address: collections[1].contract_address,
          standard_contract_id: launchpadContract.id,
        },
        {
          collection_address: collections[2].contract_address,
          standard_contract_id: launchpadContract.id,
          mintPhases: [
            {
              config: {
                price: {
                  denom: 'uaura',
                  amount: '1',
                },
              },
              starts_at: currentDate.subtract(2, 'seconds'),
              type: MintPhase.TYPE.WHITELIST,
            },
            {
              config: {
                price: {
                  denom: 'uaura',
                  amount: '2',
                },
              },
              starts_at: currentDate.subtract(1, 'second'),
              type: MintPhase.TYPE.WHITELIST,
            },
          ],
        },
      ]);

      // execute.
      await syncDataService.updateCollectionStats();

      // verify.
      // data ALL
      await sleep(2000);
      let collectionStat1 = await CollectionStat.query()
        .where('contract_address', collections[0].contract_address)
        .where('duration_type', CollectionStat.DURATION_TYPES.ALL)
        .first();
      expect(collectionStat1).toMatchObject({
        contract_address: collections[0].contract_address,
        duration_type: CollectionStat.DURATION_TYPES.ALL,
        mint_price: '7',
      });

      let collectionStat2 = await CollectionStat.query()
        .where('contract_address', collections[1].contract_address)
        .where('duration_type', CollectionStat.DURATION_TYPES.ALL)
        .first();
      expect(collectionStat2).toMatchObject({
        contract_address: collections[1].contract_address,
        duration_type: CollectionStat.DURATION_TYPES.ALL,
        mint_price: '0',
      });

      let collectionStat3 = await CollectionStat.query()
        .where('contract_address', collections[2].contract_address)
        .where('duration_type', CollectionStat.DURATION_TYPES.ALL)
        .first();
      expect(collectionStat3).toMatchObject({
        contract_address: collections[2].contract_address,
        duration_type: CollectionStat.DURATION_TYPES.ALL,
        mint_price: '2',
      });
    }, 100000);

    it('Use only Listing with type = fixed_price to calculate floor price of collection', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      // create nfts.
      const nftData = Array.from({ length: 8 }, (x, i) =>
        ({
          name: `nft${i}`,
          token_id: crypto.randomBytes(32).toString('base64'),
          metadata: {
            name: `nft${i}`,
            attributes: [],
          },
          owner_address: collection.owner_address,
          contract_address: collection.contract_address,
        }));
      await knex('nfts').insert(nftData).returning(knex.raw('*'));

      // create listing.
      const listingData = Array.from({ length: 8 }, (x, i) =>
        ({
          buyer_address: '',
          store_address: marketplace.contract_address,
          contract_address: nftData[i].contract_address,
          token_id: nftData[i].token_id,
          status: i > 5 ? Listing.STATUSES.SUCCEEDED : Listing.STATUSES.ONGOING,
          auction_config: {},
          latest_price: i < 2 || i > 5 ? 1 : i + 1,
          type: i < 2 ? Listing.TYPE.ENGLISH_AUCTION : Listing.TYPE.FIXED_PRICE,
        }));
      await knex('listings').insert(listingData);

      // execute.
      await syncDataService.updateCollectionStats();

      // verify.
      let collectionStat = await CollectionStat.query()
        .where('contract_address', collection.contract_address)
        .where('duration_type', CollectionStat.DURATION_TYPES.ALL)
        .first();
      expect(collectionStat.floor_price).toBe('3');
    }, 100000);

    it('Do not update stat of collection with null contract address', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();
      delete collection.id;
      delete collection.contract_address;
      delete collection.slug;
      await Collection.query().insert(collection);

      // execute.
      await syncDataService.updateCollectionStats();

      // verify.
      await sleep(1000);
      const collectionStats = await CollectionStat.query().whereNull('contract_address');
      expect(collectionStats.length).toBe(0);
    }, 100000);

    it('Do not count burned NFTs', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();
      const users = await User.query().limit(3);

      // create nfts.
      const nftData = Array.from({ length: 8 }, (x, i) =>
        ({
          name: `nft${i}`,
          token_id: crypto.randomBytes(32).toString('base64'),
          metadata: {
            name: `nft${i}`,
            attributes: [],
          },
          owner_address: users[i <= 1 ? i : 2].aura_address,
          contract_address: collection.contract_address,
          burned_at: i <= 1 ? new Date() : undefined,
        }));

      await knex('nfts').insert(nftData).returning(knex.raw('*'));

      // execute.
      await syncDataService.updateCollectionStats();

      // verify.
      // data ALL
      await sleep(2000);
      let collectionStat = await CollectionStat.query()
        .where('contract_address', collection.contract_address)
        .where('duration_type', CollectionStat.DURATION_TYPES.ALL)
        .first();
      expect(collectionStat).toMatchObject({
        contract_address: collection.contract_address,
        duration_type: CollectionStat.DURATION_TYPES.ALL,
        total_owners: 1,
        total_nfts: 6,
      });
    }, 100000);
  });
});
