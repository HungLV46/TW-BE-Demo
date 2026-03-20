const { ServiceBroker } = require('moleculer');

const SyncListingSchema = require('@services/sync_listing.service');
const SyncBlockSchema = require('@services/sync_block.service');
const SyncDataSchema = require('@services/sync_data.service');
const NftServiceSchema = require('@services/nft.service');
const MarketplaceSchema = require('@services/marketplace.service');
const NotificationSchema = require('@services/notification.service');
const {
  Listing, User, Store, SyncInformation
} = require('@models');
const chainConfig = require('@config/chain').defaultChain;
const { setupBlockchainClient, sleep } = require('../helpers/test-utility');
const { listNft, buyListing } = require('@helpers/listing');
const knex = require('@config/database');

jest.setTimeout(100000);

const axios = require('axios').default;
jest.spyOn(axios, 'post');
const { createSuccessResponse } = require('../factories/horoscope/cw721_activities_response');

/*
 * This test will go through a full listing flow in marketplace:
 * - user 0 creates a listing
 * - user 1 buys the listing
 * - user 1 creates a new listing
 * - user 2 buys the listing
 * - user 0 will receive royalty from the sale
 */

describe("Test 'buy listing with royalty'", () => {
  let broker = new ServiceBroker({ logger: false });
  broker.createService(SyncBlockSchema, { settings: { max_sync_block: 100 } });
  broker.createService(SyncListingSchema);
  broker.createService(SyncDataSchema);
  broker.createService(MarketplaceSchema);
  const nftService = broker.createService(NftServiceSchema);
  broker.createService(NotificationSchema);

  let client;
  let users;
  let marketplace;
  let nft;
  const auctionConfig = {
    fixed_price: {
      price: {
        amount: '10000',
        denom: chainConfig.denom,
      },
    },
  };

  async function updateBalances() {
    return Promise.all(
      users.map(async (user) => {
        // eslint-disable-next-line no-param-reassign
        user.balance = await client.getBalance(user.aura_address, chainConfig.denom);
      }),
    );
  }

  beforeAll(async () => {
    process.env.DB_RESET = true;
    process.env.NO_USERS = 3;
    process.env.NO_COLLECTIONS = 1;
    process.env.NO_NFTS = 1;

    await knex('listings').truncate();
    await knex('nft_histories').truncate();

    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '03_collections.js' });
    await knex.seed.run({ specific: '05_nfts.js' });
    await knex.seed.run({ specific: '09_marketplace.js' });
    await knex.seed.run({ specific: '01_sync_informations.js' });

    await broker.start();

    client = (await setupBlockchainClient(3)).client;
    users = await User.query().withGraphJoined('[nfts]');
    marketplace = await Store.query().findOne({ subdomain: 'aura', status: Store.STATUSES.ACTIVE });
  });
  afterAll(async () =>
    broker.stop());

  test('should sync listing creation', async () => {
    const user = users[0];
    nft = user.nfts[0];

    await listNft(client, user, nft, marketplace, auctionConfig);

    await sleep(1000); // wait for the block to be minted
    await broker.call('sync-block.syncBlock');
    await sleep(4000); // wait for sync to finish

    const listing = await Listing.query()
      .where({
        token_id: nft.token_id,
        contract_address: nft.contract_address,
      })
      .first();
    expect(listing).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: marketplace.contract_address,
        status: 'ongoing',
        auction_config: {
          config: {
            fixed_price: {
              price: {
                amount: '10000',
                denom: chainConfig.denom,
              },
            },
          },
        },
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      }),
    );
  });

  test('should sync sold listing', async () => {
    const listing = await Listing.query().withGraphJoined('nft').first();

    // user 1 buy the listing
    await buyListing(client, users[1], listing);

    await sleep(1000);
    await broker.call('sync-block.syncBlock');
    await sleep(4000);

    // fake horoscope transfer activities
    const syncInformation = await SyncInformation.query()
      .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
      .first();
    axios.post.mockImplementation(() =>
      createSuccessResponse([
        {
          id: parseInt(syncInformation.query) + 1,
          action: 'transfer_nft',
          from: listing.seller_address,
          to: users[1].aura_address,
          contract_address: listing.contract_address,
          token_id: listing.token_id,
          height: 111,
          hash: 'hash',
        },
      ]));
    await nftService.syncNfts();
    await sleep(1000);

    const updatedListing = await Listing.query().findById(listing.id);
    expect(updatedListing.status).toEqual(Listing.STATUSES.SUCCEEDED);

    // reload users and nft
    users[1] = await users[1].$query().withGraphJoined('[nfts]');
    expect(users[1].nfts.map((e) =>
      e.token_id)).toContain(listing.nft.token_id);
  });

  test('user 1 resell the nft', async () => {
    // user 1 list the nft
    await listNft(client, users[1], nft, marketplace, auctionConfig);

    await sleep(1000);
    await broker.call('sync-block.syncBlock');
    await sleep(4000);

    // user 2 buy the listing
    const newListing = await Listing.query()
      .where({
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        status: Listing.STATUSES.ONGOING,
      })
      .first();

    const user0BalanceBefore = users[0].balance;
    const user1BalanceBefore = users[1].balance;

    await buyListing(client, users[2], newListing);

    await sleep(1000);
    await broker.call('sync-block.syncBlock');
    await sleep(4000);

    await updateBalances();
    expect(parseInt(users[0].amount, 10)).toEqual(parseInt(user0BalanceBefore, 10) + 1500);
    expect(parseInt(users[1].amount, 10)).toEqual(parseInt(user1BalanceBefore, 10) + 8500);
  });
});
