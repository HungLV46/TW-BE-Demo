const { ServiceBroker } = require('moleculer');
const SearchServiceSchema = require('@services/search.service');
const SyncDataServiceSchema = require('@services/sync_data.service');
const ApiServiceSchema = require('@services/api.service');
const {
  Nft, Collection, NftHistory, Store, Listing
} = require('@models');
const knex = require('@config/database');
const NftFactory = require('../factories/nft');
const ListingFactory = require('../factories/listing');

const crypto = require('crypto');
const _ = require('lodash');

let marketplace;
describe('Test search', () => {
  let broker = new ServiceBroker({ logger: false });
  broker.createService(ApiServiceSchema);
  const syncDataService = broker.createService(SyncDataServiceSchema);
  broker.createService(SearchServiceSchema);

  beforeAll(async () => {
    if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
      await Promise.all([knex('deployed_contracts').del(), knex('stores').del()]);
    }

    await broker.start();
    await Promise.all([
      knex.seed.run({ specific: 'user.seed.js' }),
      knex.seed.run({ specific: 'collection.seed.js' }),
      knex.seed.run({ specific: 'nft.seed.js' }),
      knex.seed.run({ specific: 'marketplace.seed.js' }),
    ]);

    marketplace = await Store.query().where({ subdomain: 'aura', status: Store.STATUSES.ACTIVE }).first();
  });

  beforeEach(async () => {
    await Nft.query().del();
    await NftHistory.query().del();
    await Listing.query().del();
  });

  afterAll(async () => {
    await Nft.query().del();
    await NftHistory.query().del();
    await Listing.query().del();

    await broker.stop();
  });

  describe('Test POST /collections/:contract_address/nfts-search', () => {
    it('Search success with NFT attribute conditions', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      const nfts = await Nft.query()
        .insertGraph([
          {
            name: 'nft1',
            token_id: crypto.randomBytes(32).toString('base64'),
            metadata: {
              name: 'nft1',
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_3', value: 'value_4' },
                { trait_type: 'trait_type_4', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_4', display_type: 'number', value: 8 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 5 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 9 },
                { trait_type: 'trait_type_6', display_type: 'number', value: 7 },
                { trait_type: 'trait_type_6', display_type: 'number', value: 9 },
              ],
            },
            owner_address: collection.owner_address,
            contract_address: collection.contract_address,
          },
          {
            name: 'nft2',
            token_id: crypto.randomBytes(32).toString('base64'),
            metadata: {
              name: 'nft2',
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_5' },
                { trait_type: 'trait_type_2', value: 'value_3' },
                { trait_type: 'trait_type_3', value: 'value_4' },
                { trait_type: 'trait_type_4', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_4', display_type: 'number', value: 8 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 5 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 9 },
                { trait_type: 'trait_type_6', display_type: 'number', value: 7 },
                { trait_type: 'trait_type_6', display_type: 'number', value: 9 },
              ],
            },
            owner_address: collection.owner_address,
            contract_address: collection.contract_address,
          },
          {
            name: 'nft3',
            token_id: crypto.randomBytes(32).toString('base64'),
            metadata: {
              name: 'nft3',
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_7' }, // filtered out by this condition
                { trait_type: 'trait_type_3', value: 'value_4' },
                { trait_type: 'trait_type_4', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_4', display_type: 'number', value: 8 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 5 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 9 },
                { trait_type: 'trait_type_6', display_type: 'number', value: 7 },
              ],
            },
            owner_address: collection.owner_address,
            contract_address: collection.contract_address,
          },
          {
            name: 'nft4',
            token_id: crypto.randomBytes(32).toString('base64'),
            metadata: {
              name: 'nft4',
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_3', value: 'value_5' }, // filtered out by this condition
                { trait_type: 'trait_type_4', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_4', display_type: 'number', value: 8 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 5 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 9 },
                { trait_type: 'trait_type_6', display_type: 'number', value: 7 },
              ],
            },
            owner_address: collection.owner_address,
            contract_address: collection.contract_address,
          },
          {
            name: 'nft5',
            token_id: crypto.randomBytes(32).toString('base64'),
            metadata: {
              name: 'nft5',
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_3', value: 'value_4' },
                { trait_type: 'trait_type_4', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_4', display_type: 'number', value: 8 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 3 }, // filtered out by this condition
                { trait_type: 'trait_type_6', display_type: 'number', value: 7 },
              ],
            },
            owner_address: collection.owner_address,
            contract_address: collection.contract_address,
          },
          {
            name: 'nft6',
            token_id: crypto.randomBytes(32).toString('base64'),
            metadata: {
              name: 'nft6',
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_3', value: 'value_4' },
                { trait_type: 'trait_type_4', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_4', display_type: 'number', value: 8 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 11 }, // filtered out by this condition
                { trait_type: 'trait_type_6', display_type: 'number', value: 7 },
              ],
            },
            owner_address: collection.owner_address,
            contract_address: collection.contract_address,
          },
          {
            name: 'nft7',
            token_id: crypto.randomBytes(32).toString('base64'),
            metadata: {
              name: 'nft7',
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_3', value: 'value_4' },
                { trait_type: 'trait_type_4', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_4', display_type: 'number', value: 8 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 9 },
                { trait_type: 'trait_type_6', display_type: 'number', value: 5 }, // filtered out by this condition
              ],
            },
            owner_address: collection.owner_address,
            contract_address: collection.contract_address,
          },
          {
            name: 'nft8',
            token_id: crypto.randomBytes(32).toString('base64'),
            metadata: {
              name: 'nft8',
              attributes: [
                { trait_type: 'trait_type_1', value: 'value_1' },
                { trait_type: 'trait_type_2', value: 'value_2' },
                { trait_type: 'trait_type_3', value: 'value_4' },
                { trait_type: 'trait_type_4', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_4', display_type: 'number', value: 8 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 4 },
                { trait_type: 'trait_type_5', display_type: 'number', value: 9 },
                { trait_type: 'trait_type_6', display_type: 'number', value: 12 }, // filtered out by this condition
              ],
            },
            owner_address: collection.owner_address,
            contract_address: collection.contract_address,
          },
        ])
        .returning(knex.raw('*'))
        .then((response) => {
          response.forEach((nft) => {
            // eslint-disable-next-line no-param-reassign
            nft.attributes = nft.metadata.attributes;
          });
          return response;
        });
      await syncDataService.createNftAttributesFromNfts(collection, nfts);

      // execute.
      const result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        conditions: {
          string_traits: [
            {
              trait_type: 'trait_type_2',
              values: ['value_2', 'value_3'],
            },
            {
              trait_type: 'trait_type_3',
              values: ['value_4'],
            },
          ],
          numeric_traits: [
            {
              trait_type: 'trait_type_5',
              min: '4',
              max: '10',
            },
            {
              trait_type: 'trait_type_6',
              min: '8',
              max: '10',
            },
          ],
        },
      });

      // verify.
      const expectedNfts = await Nft.query()
        .where({ contract_address: collection.contract_address })
        .whereIn('id', [nfts[0].id, nfts[1].id])
        .orderBy('id', 'desc');

      expect(result.data.length).toBe(2);
      expect(result.page).toBe(1);
      expect(result.total).toBe(2);
      expect(result.per_page).toBe(25);

      expect(result.data).toMatchObject(expectedNfts);
    });

    it('Search success with order conditions = ending soon', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      // create nfts.
      const nftData = Array.from({ length: 7 }, (x, i) =>
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
      const nfts = await knex('nfts').insert(nftData).returning(knex.raw('*'));

      // create listing.
      const listingData = Array.from({ length: 7 }, (x, i) =>
        ({
          buyer_address: '',
          store_address: marketplace.contract_address,
          contract_address: nftData[i].contract_address,
          token_id: nftData[i].token_id,
          status: 'ongoing',
          auction_config: {},
        }));
      const updateTime = new Date();
      await knex('listings').insert([
        {
          ...listingData[0],
          end_time: new Date(updateTime.setSeconds(7)),
        },
        {
          ...listingData[1],
          status: 'succeeded',
          end_time: new Date(updateTime.setSeconds(6)),
        },
        {
          ...listingData[2],
          end_time: new Date(updateTime.setSeconds(5)),
        },
        {
          ...listingData[4],
          end_time: new Date(updateTime.setSeconds(2)),
        },
        {
          ...listingData[5],
          end_time: new Date(updateTime.setSeconds(3)),
        },
      ]);
      await knex.raw(`
        Update nfts
        SET last_listing_id = listings.id
        FROM listings
        WHERE nfts.contract_address = listings.contract_address AND nfts.token_id = listings.token_id
      `);

      // execute.
      let result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        order: Nft.ORDER_TYPE.ENDING_SOON,
      });

      // verify.
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject(
        [nfts[4], nfts[5], nfts[2], nfts[0], nfts[1], nfts[6], nfts[3]].map((nft) =>
          nft.id),
      );
    });

    it('Search success with order conditions', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      // create nfts.
      const nftData = Array.from({ length: 7 }, (x, i) =>
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
      const nfts = await knex('nfts').insert(nftData).returning(knex.raw('*'));

      // create nft_histories.
      const nftHistoryData = Array.from({ length: 7 }, (x, i) =>
        ({
          token_id: nftData[i].token_id,
          contract_address: collection.contract_address,
        }));
      const transactionTime = new Date();
      await knex('nft_histories').insert([
        {
          ...nftHistoryData[1],
          event: NftHistory.EVENTS.BUY,
          transaction_time: new Date(transactionTime.setSeconds(1)),
        },
        {
          ...nftHistoryData[2],
          event: NftHistory.EVENTS.BUY,
          transaction_time: new Date(transactionTime.setSeconds(4)),
        },
        {
          ...nftHistoryData[3],
          event: NftHistory.EVENTS.BUY,
          transaction_time: new Date(transactionTime.setSeconds(2)),
        },
        {
          ...nftHistoryData[4],
          event: NftHistory.EVENTS.BUY,
          transaction_time: new Date(transactionTime.setSeconds(5)),
        },
        {
          ...nftHistoryData[5],
          event: NftHistory.EVENTS.BUY,
          transaction_time: new Date(transactionTime.setSeconds(6)),
        },
        {
          ...nftHistoryData[6],
          event: NftHistory.EVENTS.TRANSFER,
          transaction_time: new Date(transactionTime.setSeconds(3)),
        },
        {
          ...nftHistoryData[3],
          event: NftHistory.EVENTS.BUY,
          transaction_time: new Date(transactionTime.setSeconds(10)),
        },
      ]);

      // create listing.
      const listingData = Array.from({ length: 7 }, (x, i) =>
        ({
          buyer_address: '',
          store_address: marketplace.contract_address,
          contract_address: nftData[i].contract_address,
          token_id: nftData[i].token_id,
          status: 'ongoing',
          auction_config: {},
        }));
      const updateTime = new Date();
      await knex('listings').insert([
        {
          ...listingData[0],
          latest_price: 13.1,
          created_at: new Date(updateTime.setSeconds(7)),
        },
        {
          ...listingData[1],
          latest_price: 14.1,
          created_at: new Date(updateTime.setSeconds(6)),
        },
        {
          ...listingData[2],
          latest_price: 15.1,
          created_at: new Date(updateTime.setSeconds(5)),
        },
        {
          ...listingData[3],
          latest_price: 10.1,
          created_at: new Date(updateTime.setSeconds(1)),
        },
        {
          ...listingData[4],
          latest_price: 11.1,
          created_at: new Date(updateTime.setSeconds(2)),
        },
        {
          ...listingData[5],
          latest_price: 12.1,
          created_at: new Date(updateTime.setSeconds(3)),
        },
      ]);
      await knex.raw(`
        Update nfts
        SET last_listing_id = listings.id
        FROM listings
        WHERE nfts.contract_address = listings.contract_address AND nfts.token_id = listings.token_id
      `);

      // execute RECENTLY_CREATED.
      let result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        order: Nft.ORDER_TYPE.RECENTLY_CREATED,
      });
      // verify RECENTLY_CREATED.
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject(
        [nfts[6], nfts[5], nfts[4], nfts[3], nfts[2], nfts[1], nfts[0]].map((nft) =>
          nft.id),
      );

      // execute RECENTLY_LISTED.
      result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        order: Nft.ORDER_TYPE.RECENTLY_LISTED,
      });
      // verify RECENTLY_LISTED.
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject(
        [nfts[0], nfts[1], nfts[2], nfts[5], nfts[4], nfts[3], nfts[6]].map((nft) =>
          nft.id),
      );

      // execute LOWEST_PRICE.
      result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        order: Nft.ORDER_TYPE.LOWEST_PRICE,
      });
      // verify LOWEST_PRICE.
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject(
        [nfts[3], nfts[4], nfts[5], nfts[0], nfts[1], nfts[2], nfts[6]].map((nft) =>
          nft.id),
      );

      // execute HIGHEST_PRICE.
      result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        order: Nft.ORDER_TYPE.HIGHEST_PRICE,
      });
      // verify HIGHEST_PRICE.
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject(
        [nfts[2], nfts[1], nfts[0], nfts[5], nfts[4], nfts[3], nfts[6]].map((nft) =>
          nft.id),
      );

      // execute RECENTLY_SOLD.
      result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        order: Nft.ORDER_TYPE.RECENTLY_SOLD,
      });
      // verify RECENTLY_SOLD.
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject(
        [nfts[3], nfts[5], nfts[4], nfts[2], nfts[1], nfts[6], nfts[0]].map((nft) =>
          nft.id),
      );
    });

    it('Search success with name, status and price conditions', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      // create nfts.
      const nftData = Array.from({ length: 7 }, (x, i) =>
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
      nftData[1].name = 'nftxxx1';
      nftData[2].name = 'nftxxx2';
      nftData[4].name = 'nftxxx4';
      const nfts = await knex('nfts').insert(nftData).returning(knex.raw('*'));

      // create listing.
      const listingData = Array.from({ length: 7 }, (x, i) =>
        ({
          buyer_address: '',
          store_address: marketplace.contract_address,
          contract_address: nftData[i].contract_address,
          token_id: nftData[i].token_id,
          status: 'ongoing',
          auction_config: {},
        }));
      await knex('listings').insert([
        {
          ...listingData[0],
          latest_price: 13.1,
        },
        {
          ...listingData[1],
          latest_price: 14.1,
        },
        {
          ...listingData[2],
          latest_price: 15.1,
        },
        {
          ...listingData[3],
          latest_price: 16.1,
        },
        {
          ...listingData[4],
          latest_price: 14.1,
          status: null,
        },
        {
          ...listingData[5],
          latest_price: 18.1,
        },
      ]);
      await knex.raw(`
        Update nfts
        SET last_listing_id = listings.id
        FROM listings
        WHERE nfts.contract_address = listings.contract_address AND nfts.token_id = listings.token_id
      `);

      // execute.
      let result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        conditions: {
          name: 'nftxxx',
          price: { min: 13, max: 15.5 },
        },
      });

      // verify.
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject([nfts[2], nfts[1]].map((nft) =>
        nft.id));
      expect(result.total).toBe(2);
    });

    it('Search success with listing type', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      // create nfts.
      const nfts = await knex('nfts')
        .insert(
          Array.from({ length: 4 }, () =>
            NftFactory.build({
              owner_address: collection.owner_address,
              contract_address: collection.contract_address,
            })),
        )
        .returning('*');

      // create listing.
      await knex('listings').insert([
        ListingFactory.build({
          type: Listing.TYPE.ENGLISH_AUCTION,
          ..._.pick(nfts[0], 'contract_address', 'token_id'),
          store_address: marketplace.contract_address,
        }),
        ListingFactory.build({
          type: Listing.TYPE.ENGLISH_AUCTION,
          ..._.pick(nfts[1], 'contract_address', 'token_id'),
          store_address: marketplace.contract_address,
        }),
        ListingFactory.build({
          type: Listing.TYPE.FIXED_PRICE,
          ..._.pick(nfts[2], 'contract_address', 'token_id'),
          store_address: marketplace.contract_address,
        }),
        ListingFactory.build({
          type: Listing.TYPE.FIXED_PRICE,
          ..._.pick(nfts[3], 'contract_address', 'token_id'),
          store_address: marketplace.contract_address,
        }),
      ]);
      await knex.raw(`
        Update nfts
        SET last_listing_id = listings.id
        FROM listings
        WHERE nfts.contract_address = listings.contract_address AND nfts.token_id = listings.token_id
      `);

      // execute: find NFTs listed with type = ENGLISH_AUCTION
      let result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        conditions: { listing_types: [Listing.TYPE.ENGLISH_AUCTION] },
      });

      // verify.
      expect(result.total).toBe(2);
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject([nfts[1].id, nfts[0].id]);

      // execute: find NFTs listed with type = ENGLISH_AUCTION & FIXED_PRICE
      result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        conditions: { listing_types: [Listing.TYPE.ENGLISH_AUCTION, Listing.TYPE.FIXED_PRICE] },
      });

      // verify.
      expect(result.total).toBe(4);
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject([nfts[3].id, nfts[2].id, nfts[1].id, nfts[0].id]);

      // execute: find NFTs listed with type = FIXED_PRICE
      result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        conditions: { listing_types: [Listing.TYPE.FIXED_PRICE] },
      });

      // verify.
      expect(result.total).toBe(2);
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject([nfts[3].id, nfts[2].id]);
    });

    it.skip('Search status prioritize ongoing listings', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      // create nfts.
      const nftData = Array.from({ length: 2 }, (x, i) =>
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
      const nfts = await knex('nfts').insert(nftData).returning(knex.raw('*'));

      // create listing.
      const listingData = Array.from({ length: 2 }, (x, i) =>
        ({
          buyer_address: '',
          store_address: marketplace.contract_address,
          contract_address: nftData[i].contract_address,
          token_id: nftData[i].token_id,
          status: 'ongoing',
          auction_config: {},
          type: Listing.TYPE.FIXED_PRICE,
        }));
      await knex('listings').insert([
        {
          ...listingData[0],
          latest_price: 14.1,
        },
        {
          ...listingData[1],
          latest_price: 15.1,
        },
        {
          ...listingData[1],
          status: Listing.STATUSES.SUCCEEDED,
          latest_price: 13.1,
        },
      ]);
      await knex.raw(`
        Update nfts
        SET last_listing_id = listings.id
        FROM listings
        WHERE nfts.contract_address = listings.contract_address AND nfts.token_id = listings.token_id
      `);

      // execute.
      let result = await broker.call('search.search', {
        contract_address: collection.contract_address,
        order: Nft.ORDER_TYPE.HIGHEST_PRICE,
      });

      // verify.
      expect(result.data.map((nft) =>
        nft.id)).toMatchObject([nfts[1], nfts[0]].map((nft) =>
        nft.id));
      expect(result.total).toBe(2);
    });

    it('Search not include burned Nfts', async () => {
      // setup.
      const collection = await Collection.query().whereNotDeleted().first();

      // create nfts.
      const nftData = Array.from({ length: 4 }, (x, i) =>
        ({
          name: `nft${i}`,
          token_id: crypto.randomBytes(32).toString('base64'),
          metadata: {
            name: `nft${i}`,
            attributes: [],
          },
          owner_address: collection.contract_address,
          contract_address: collection.contract_address,
          burned_at: i <= 1 ? new Date() : undefined,
        }));
      await knex('nfts').insert(nftData).returning(knex.raw('*'));

      // execute.
      let result = await broker.call('search.search', { contract_address: collection.contract_address });

      // verify.
      expect(result.total).toBe(2);
      expect(result.data.map((nft) =>
        nft.token_id)).toEqual(
        expect.arrayContaining([nftData[2].token_id, nftData[3].token_id]),
      );
    });
  });
});
