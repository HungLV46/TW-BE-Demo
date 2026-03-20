const { ServiceBroker } = require('moleculer');
const dayjs = require('dayjs');

const SyncListingSchema = require('@services/sync_listing.service');
const SyncBlockSchema = require('@services/sync_block.service');
const SyncDataSchema = require('@services/sync_data.service');
const NftSchema = require('@services/nft.service');
const MarketplaceSchema = require('@services/marketplace.service');
const NotificationSchema = require('@services/notification.service');

const {
  Listing,
  User,
  Store,
  SyncInformation,
  NftHistory,
  SyncTx,
  Offer,
  DeployedContract,
  StandardContract,
} = require('@models');

const chainConfig = require('@config/chain').defaultChain;
const { setupBlockchainClient, sleep, getRoundedDateForTesting } = require('../helpers/test-utility');
const { approveNft, transferNft } = require('../helpers/nft');
const { listNft, parseExpirationTime } = require('@helpers/listing');

const { executeContract } = require('@helpers/blockchain_utils');

const knex = require('@config/database');
const _ = require('lodash');

const { coins } = require('@cosmjs/proto-signing');
const { createSuccessResponse } = require('../factories/horoscope/cw721_activities_response');

const axios = require('axios').default;
jest.spyOn(axios, 'post');

let client;
let wallet;
let marketplace;

jest.setTimeout(100000);

describe("Test 'sync_listing'", () => {
  let broker = new ServiceBroker({ logger: false });
  broker.createService(SyncBlockSchema, { settings: { max_sync_block: 100 } });
  const nftService = broker.createService(NftSchema);
  broker.createService(SyncDataSchema);
  broker.createService(SyncListingSchema);
  broker.createService(MarketplaceSchema);
  broker.createService(NotificationSchema);

  beforeAll(async () => {
    process.env.NO_USERS = 2;
    process.env.NO_COLLECTIONS = 2;

    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '03_collections.js' });
    await knex.seed.run({ specific: '05_nfts.js' });

    await knex.seed.run({ specific: '09_marketplace.js' });

    marketplace = await Store.query().where({ subdomain: 'aura', status: Store.STATUSES.ACTIVE }).first();
    await Listing.query().del(); // remove data created by other tests

    const setup = await setupBlockchainClient(process.env.NO_USERS);
    client = setup.client;
    wallet = setup.wallet;

    await broker.start();
  });

  beforeEach(async () => {
    // skip sync previous block
    const latestBlock = await client.getBlock();
    await SyncInformation.query().where({ key: 'last-block-synced' }).patch({ height: latestBlock.header.height });
  });

  afterAll(async () => {
    await broker.stop();
    await knex.destroy();
  });

  describe('Test sync fixed price listing on marketplace', () => {
    test('should sync listing creation', async () => {
      // get an user, their nfts and their store from db
      const user = await User.query().withGraphJoined('nfts', { joinOperation: 'innerJoin' }).first();
      const nft = user.nfts[0];

      await approveNft(client, nft, marketplace.contract_address);

      const currentBlock = await client.getBlock();
      const startTime = currentBlock.header.height + 10;
      const endTime = dayjs().add(100, 'second').valueOf().toString() + '000000';
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: '999999999000000',
            denom: chainConfig.denom,
          },
          start_time: {
            at_height: startTime,
          },
          end_time: {
            at_time: endTime,
          },
        },
      };

      // create a listing on chain from a nft of user
      const msg = {
        list_nft: {
          contract_address: nft.contract_address,
          token_id: nft.token_id,
          auction_config: auctionConfig,
        },
      };
      await client.execute(user.aura_address, marketplace.contract_address, msg, 'auto');

      // since we sync 1 block behind, we need to wait for 1 block to be mined
      await sleep(1000);

      // sync listing creation
      await broker.call('sync-block.syncBlock');

      // wait for listings to be synced
      await sleep(4000);

      // check if listing is created in db
      const listing = await Listing.query()
        .where({
          token_id: nft.token_id,
          contract_address: nft.contract_address,
        })
        .first();

      expect(listing).toEqual(
        expect.objectContaining({
          type: Listing.TYPE.FIXED_PRICE,
          token_id: nft.token_id,
          contract_address: nft.contract_address,
          store_address: marketplace.contract_address,
          status: 'ongoing',
          latest_price: '999999999000000',
          start_time: expect.any(Date),
          end_time: expect.any(Date),
        }),
      );

      expect(dayjs(listing.start_time).isBefore(dayjs(listing.end_time))).toBe(true);
    });

    test('should sync listing when nft is transferred', async () => {
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: '10000',
            denom: chainConfig.denom,
          },
        },
      };
      const user = await User.query().withGraphJoined('nfts').first();
      const nft = user.nfts[0];
      await listNft(client, user, nft, marketplace, auctionConfig);
      const newOwner = await User.query().whereNot({ aura_address: user.aura_address }).first();

      // transfer the nft to new owner
      const transferResponse = await transferNft(client, nft, newOwner.aura_address);

      // sync again
      await sleep(1000);
      await broker.call('sync-block.syncBlock');
      await sleep(2000);

      // fake horoscope transfer activities
      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post.mockImplementation(() =>
        createSuccessResponse([
          {
            id: parseInt(syncInformation.query) + 1,
            action: 'transfer_nft',
            from: user.aura_address,
            to: newOwner.aura_address,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            height: transferResponse.height,
            hash: transferResponse.transactionHash,
          },
        ]));
      await nftService.syncNfts();
      await sleep(2000);

      // listing should be ended
      const listing = await Listing.query()
        .where({
          token_id: nft.token_id,
          contract_address: nft.contract_address,
        })
        .orderBy('id', 'desc')
        .first();
      expect(listing.status).toEqual(Listing.STATUSES.ENDED);
    });

    test('should sync cancel listing', async () => {
      // get an user, their nfts and their store from db
      const user = await User.query().withGraphJoined('nfts', { joinOperation: 'innerJoin' }).first();
      const nft = user.nfts[0];

      const currentBlock = await client.getBlock();
      const startTime = currentBlock.header.height + 10;
      const endTime = dayjs().add(100, 'second').valueOf().toString() + '000000';
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: '10000',
            denom: chainConfig.denom,
          },
          start_time: {
            at_height: startTime,
          },
          end_time: {
            at_time: endTime,
          },
        },
      };
      await listNft(client, user, nft, marketplace, auctionConfig);

      const cancelMsg = {
        cancel: {
          contract_address: nft.contract_address,
          token_id: nft.token_id,
        },
      };
      const response = await client.execute(user.aura_address, marketplace.contract_address, cancelMsg, 'auto');

      // execute.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');
      await sleep(4000);

      // verify
      const tx = await client.getTx(response.transactionHash);
      const block = await client.getBlock(tx.height);
      const syncedTx = await SyncTx.query().where({ hash: response.transactionHash }).first();
      expect(syncedTx).toMatchObject({
        hash: response.transactionHash,
        height: block.header.height,
        msg_index: 0,
        block_time: getRoundedDateForTesting(block.header.time),
        raw_data: expect.any(String),
      });

      const listing = await Listing.query()
        .where({
          token_id: nft.token_id,
          contract_address: nft.contract_address,
        })
        .first();
      expect(listing).toMatchObject({
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: marketplace.contract_address,
        status: Listing.STATUSES.CANCELLED,
        start_time: expect.any(Date),
        end_time: expect.any(Date),
      });
      expect(dayjs(listing.start_time).isBefore(dayjs(listing.end_time))).toBe(true);

      const nftHistory = await NftHistory.query()
        .where({ contract_address: nft.contract_address, token_id: nft.token_id })
        .orderBy('id', 'desc')
        .first();
      expect(nftHistory).toMatchObject({
        transaction_hash: response.transactionHash,
        from_address: user.aura_address,
        to_address: null,
        event: NftHistory.EVENTS.LIST_CANCELLED,
        token_id: nft.token_id,
        transaction_time: getRoundedDateForTesting(block.header.time),
        contract_address: nft.contract_address,
        price: { amount: listing.latest_price },
        additional_information: null,
        block_height: tx.height,
        sync_tx_id: syncedTx.id,
      });
    });
  });

  describe('Test sync offer on marketplace', () => {
    test('Offer NFT success', async () => {
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: '10000',
            denom: chainConfig.denom,
          },
        },
      };
      const users = await User.query().withGraphJoined('nfts');
      const userHasNft = users[0];
      const nft = userHasNft.nfts[0];
      await listNft(client, userHasNft, nft, marketplace, auctionConfig);

      // give all user[1] a certain amount of vaura
      const convertAmount = 1000000;
      let msg = {
        mint: {
          recipient: users[1].aura_address,
          amount: convertAmount.toString(),
        },
      };
      const twilightTokenContract = await StandardContract.query()
        .where({ name: StandardContract.TYPES.BIDDING_TOKEN, status: 'active' })
        .first();
      const deployedContract = await DeployedContract.query()
        .where({ standard_contract_id: twilightTokenContract.id })
        .orderBy('id', 'desc')
        .first();
      await executeContract(
        deployedContract.contract_address,
        wallet,
        msg,
        chainConfig,
        coins(convertAmount, chainConfig.denom),
      );

      // make offer
      const offerer = users[1];
      const endTime = dayjs().add(100, 'second').valueOf().toString() + '000000';
      msg = {
        offer_nft: {
          nft: {
            contract_address: nft.contract_address,
            token_id: nft.token_id,
          },
          funds_amount: '100',
          end_time: {
            at_time: endTime,
          },
        },
      };
      const response = await client.execute(offerer.aura_address, marketplace.contract_address, msg, 'auto');

      // execute.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');
      await sleep(4000);

      // verify.
      const syncTx = await SyncTx.query().findOne({
        hash: response.transactionHash,
      });
      expect(_.isEmpty(syncTx)).toBeFalsy();

      const block = await client.getBlock(response.height);
      const offer = await Offer.query().findOne({
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        store_address: marketplace.contract_address,
      });
      expect(offer).toMatchObject({
        offerer_address: offerer.aura_address,
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: marketplace.contract_address,
        status: Offer.STATUSES.ONGOING,
        price: { amount: msg.offer_nft.funds_amount },
        end_time: new Date(
          parseExpirationTime(msg.offer_nft.end_time, {
            blockHeight: response.height,
            blockTime: new Date(block.header.time),
          }),
        ),
      });
      const nftHistory = await NftHistory.query().findOne({
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        event: NftHistory.EVENTS.OFFER,
      });
      expect(nftHistory).toMatchObject({
        transaction_hash: response.transactionHash,
        event: NftHistory.EVENTS.OFFER,
        from_address: offerer.aura_address,
        token_id: nft.token_id,
        transaction_time: new Date(block.header.time),
        contract_address: nft.contract_address,
        block_height: response.height,
        sync_tx_id: syncTx.id,
        price: { amount: msg.offer_nft.funds_amount },
      });
    });

    test('Accept offer NFT success', async () => {
      // user[0] lists a NFT
      const auctionConfig = {
        fixed_price: {
          price: {
            amount: '10000',
            denom: chainConfig.denom,
          },
        },
      };
      const users = await User.query().withGraphJoined('nfts');
      const nft = users[0].nfts[0];
      await listNft(client, users[0], nft, marketplace, auctionConfig);

      // give users[1] a certain amount of vaura used to place an offer
      const convertAmount = 1000000;
      let msg = {
        mint: {
          recipient: users[1].aura_address,
          amount: convertAmount.toString(),
        },
      };
      const twilightTokenContract = await StandardContract.query()
        .where({ name: StandardContract.TYPES.BIDDING_TOKEN, status: 'active' })
        .first();
      const deployedContract = await DeployedContract.query()
        .where({ standard_contract_id: twilightTokenContract.id })
        .orderBy('id', 'desc')
        .first();
      await executeContract(
        deployedContract.contract_address,
        wallet,
        msg,
        chainConfig,
        coins(convertAmount, chainConfig.denom),
      );

      // users[1] makes an offer
      msg = {
        offer_nft: {
          nft: {
            contract_address: nft.contract_address,
            token_id: nft.token_id,
          },
          funds_amount: '100',
          end_time: {
            at_time: dayjs().add(100, 'second').valueOf().toString() + '000000',
          },
        },
      };
      let response = await client.execute(users[1].aura_address, marketplace.contract_address, msg, 'auto');

      // users[0] accepts the offer
      msg = {
        accept_nft_offer: {
          offerer: users[1].aura_address,
          nft: {
            contract_address: nft.contract_address,
            token_id: nft.token_id,
          },
          funds_amount: '100',
        },
      };
      response = await client.execute(users[0].aura_address, marketplace.contract_address, msg, 'auto');

      // execute.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');
      await sleep(2000);

      // fake horoscope transfer activities
      const syncInformation = await SyncInformation.query()
        .where({ key: SyncInformation.SYNC_KEY.HOROSCOPE_CW721_ACTIVITY_ID })
        .first();
      axios.post.mockImplementation(() =>
        createSuccessResponse([
          {
            id: parseInt(syncInformation.query) + 1,
            action: 'transfer_nft',
            from: users[0].aura_address,
            to: users[1].aura_address,
            contract_address: nft.contract_address,
            token_id: nft.token_id,
            height: response.height,
            hash: response.transactionHash,
          },
        ]));
      await nftService.syncNfts();
      await sleep(2000);

      // verify.
      const syncTx = await SyncTx.query().findOne({
        hash: response.transactionHash,
      });
      expect(_.isEmpty(syncTx)).toBeFalsy();

      const block = await client.getBlock(response.height);

      // verify users[1] offer ACCEPTED
      const offer = await Offer.query().findOne({
        offerer_address: users[1].aura_address,
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        store_address: marketplace.contract_address,
      });
      expect(offer).toMatchObject({ status: Offer.STATUSES.ACCEPTED });

      // verify corresponding listing is cancelled
      const listing = await Listing.query().findOne({
        token_id: nft.token_id,
        contract_address: nft.contract_address,
        store_address: marketplace.contract_address,
      });
      expect(listing.status).toBe(Listing.STATUSES.CANCELLED);

      const nftHistories = await NftHistory.query()
        .where({
          contract_address: nft.contract_address,
          token_id: nft.token_id,
        })
        .orderBy('id', 'desc')
        .limit(2);
      // verify users[1] buys NFT from users[0]
      expect(nftHistories[1]).toMatchObject({
        transaction_hash: response.transactionHash,
        event: NftHistory.EVENTS.BUY,
        from_address: users[0].aura_address,
        to_address: users[1].aura_address,
        token_id: nft.token_id,
        transaction_time: new Date(block.header.time),
        contract_address: nft.contract_address,
        block_height: response.height,
        sync_tx_id: syncTx.id,
        price: { amount: msg.accept_nft_offer.funds_amount },
      });
      // verify users[0] transfers NFT to users[1]
      expect(nftHistories[0]).toMatchObject({
        transaction_hash: response.transactionHash,
        event: NftHistory.EVENTS.TRANSFER,
        from_address: users[0].aura_address,
        to_address: users[1].aura_address,
        token_id: nft.token_id,
        transaction_time: expect.any(Date),
        contract_address: nft.contract_address,
        block_height: response.height,
        price: null,
      });
    });

    test('Cancel offer NFT success', async () => {
      // skip sync previous block
      const users = await User.query().withGraphJoined('nfts');
      const nft1 = users[0].nfts[3];
      const nft2 = users[0].nfts[4];

      // give users[1] a certain amount of vaura used to place an offer
      const convertAmount = 1000000;
      let msg = {
        mint: {
          recipient: users[1].aura_address,
          amount: convertAmount.toString(),
        },
      };
      const twilightTokenContract = await StandardContract.query()
        .where({ name: StandardContract.TYPES.BIDDING_TOKEN, status: 'active' })
        .first();
      const deployedContract = await DeployedContract.query()
        .where({ standard_contract_id: twilightTokenContract.id })
        .orderBy('id', 'desc')
        .first();
      await executeContract(
        deployedContract.contract_address,
        wallet,
        msg,
        chainConfig,
        coins(convertAmount, chainConfig.denom),
      );

      // users[1] makes 2 offers
      msg = {
        offer_nft: {
          nft: {
            contract_address: nft1.contract_address,
            token_id: nft1.token_id,
          },
          funds_amount: '100',
          end_time: {
            at_time: dayjs().add(100, 'second').valueOf().toString() + '000000',
          },
        },
      };
      await client.execute(users[1].aura_address, marketplace.contract_address, msg, 'auto');

      msg.offer_nft.nft = {
        contract_address: nft2.contract_address,
        token_id: nft2.token_id,
      };
      await client.execute(users[1].aura_address, marketplace.contract_address, msg, 'auto');

      // execute.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');
      await sleep(4000);

      // users[1] cancels offers
      msg = {
        cancel_offer: {
          nfts: [
            {
              contract_address: nft1.contract_address,
              token_id: nft1.token_id,
            },
            {
              contract_address: nft2.contract_address,
              token_id: nft2.token_id,
            },
          ],
        },
      };
      const response = await client.execute(users[1].aura_address, marketplace.contract_address, msg, 'auto');

      // execute.
      await sleep(1000);
      await broker.call('sync-block.syncBlock');
      await sleep(4000);

      // verify.
      const syncTx = await SyncTx.query().findOne({
        hash: response.transactionHash,
      });
      expect(_.isEmpty(syncTx)).toBeFalsy();

      const block = await client.getBlock(response.height);

      // verify users[1]'s 2 offers CANCELLED
      const offer1 = await Offer.query().findOne({
        offerer_address: users[1].aura_address,
        contract_address: nft1.contract_address,
        token_id: nft1.token_id,
      });
      expect(offer1).toMatchObject({ status: Offer.STATUSES.CANCELLED });

      const offer2 = await Offer.query().findOne({
        offerer_address: users[1].aura_address,
        contract_address: nft1.contract_address,
        token_id: nft1.token_id,
      });
      expect(offer2).toMatchObject({ status: Offer.STATUSES.CANCELLED });

      const nftHistory1 = await NftHistory.query()
        .where({ from_address: users[1].aura_address, token_id: nft1.token_id })
        .orderBy('id', 'desc')
        .first();
      expect(nftHistory1).toMatchObject({
        transaction_hash: response.transactionHash,
        event: NftHistory.EVENTS.OFFER_CANCELLED,
        from_address: users[1].aura_address,
        token_id: nft1.token_id,
        transaction_time: new Date(block.header.time),
        contract_address: nft1.contract_address,
        block_height: response.height,
        sync_tx_id: syncTx.id,
      });
      const nftHistory2 = await NftHistory.query()
        .where({ from_address: users[1].aura_address, token_id: nft2.token_id })
        .orderBy('id', 'desc')
        .first();
      expect(nftHistory2).toMatchObject({
        transaction_hash: response.transactionHash,
        event: NftHistory.EVENTS.OFFER_CANCELLED,
        from_address: users[1].aura_address,
        token_id: nft2.token_id,
        transaction_time: new Date(block.header.time),
        contract_address: nft2.contract_address,
        block_height: response.height,
        sync_tx_id: syncTx.id,
      });
    });
  });
});
