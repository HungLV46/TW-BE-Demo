if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('DO NOT RUN IN PRODUCTION!!');
  throw new Error('production environment not supported');
}
const { faker } = require('@faker-js/faker');
const cliProgress = require('cli-progress');
const colors = require('ansi-colors');

const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningCosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const { GasPrice } = require('@cosmjs/stargate');
const { makeCosmoshubPath } = require('@cosmjs/amino');

const chainConfig = require('../config/chain').defaultChain;

const NO_LISTINGS = process.env.NO_LISTINGS || 10;

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('listings').del();
  }

  const listings = [];
  // add normal data
  const users = await knex('users').orderBy('id', 'asc');

  // generate client for all users
  const hdPaths = [];
  for (let i = 0; i <= users.length; i += 1) {
    hdPaths.push(makeCosmoshubPath(i));
  }
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(chainConfig.mnemonic, {
    prefix: chainConfig.prefix,
    hdPaths,
  });
  const gasPrice = GasPrice.fromString(`0.025${chainConfig.denom}`);
  const client = await SigningCosmWasmClient.connectWithSigner(chainConfig.rpcEndpoint, wallet, {
    gasPrice,
    broadcastTimeoutMs: 10000,
    broadcastPollIntervalMs: 500,
  });

  // because of random process creating seed files,
  // the number of users (NO_USERS) need to be >= the number of stores (NO_STORES)
  // so that there is at least 1 user that has both store and nft
  // to create valid listing
  // sellers are users that have both store and nft
  const sellers = await knex('users')
    .select('users.*')
    .join('stores', 'users.aura_address', 'stores.owner_address')
    .join('nfts', 'users.aura_address', 'nfts.owner_address')
    .whereNotNull('stores.id')
    .whereNotNull('nfts.id')
    .groupBy('users.id');

  // create pbar
  const pbar = new cliProgress.SingleBar(
    {
      format: `${colors.cyan('Seeding')} ${colors.green('listings')} | ${colors.cyan(
        '{bar}',
      )} | {percentage}% || {value}/{total} Chunks`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );
  pbar.start(NO_LISTINGS, 0);

  for (let i = 1; i <= NO_LISTINGS; i += 1) {
    const seller = sellers[i % sellers.length];
    // eslint-disable-next-line no-await-in-loop
    const nfts = await knex('nfts').where('owner_address', '=', seller.aura_address);
    const nft = nfts[faker.mersenne.rand(nfts.length)];
    // eslint-disable-next-line no-await-in-loop
    const store = await knex('stores').where('owner_address', '=', seller.aura_address).first();

    const auctionConfig = {
      config: {
        fixed_price: {
          price: {
            amount: faker.finance.amount(1, 100, 0),
            denom: chainConfig.denom,
          },
        },
      },
      type_id: 0,
    };

    const listing = {
      id: i,
      buyer_address: '',
      seller_address: seller.aura_address,
      store_address: store.contract_address,
      contract_address: nft.contract_address,
      token_id: nft.token_id,
      status: 'ongoing',
      auction_config: auctionConfig,
      latest_price: auctionConfig.config.fixed_price.price.amount,
    };

    // create listing on chain
    const msg = {
      list_nft: {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
        auction_config: auctionConfig.config,
      },
    };

    listings.push(listing);

    // cancel any previous listing
    const cancelMsg = {
      cancel: {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
      },
    };

    // eslint-disable-next-line no-await-in-loop
    await client.execute(seller.aura_address, store.contract_address, cancelMsg, 'auto').catch((_) => {});

    // approve nft for store
    const approveMsg = {
      approve: {
        spender: store.contract_address,
        token_id: nft.token_id,
        expires: {
          never: {},
        },
      },
    };
    // eslint-disable-next-line no-await-in-loop
    await client.execute(seller.aura_address, nft.contract_address, approveMsg, 'auto');

    // eslint-disable-next-line no-await-in-loop
    await client.execute(seller.aura_address, store.contract_address, msg, 'auto');

    pbar.increment();
  }

  // TODO for now, should rely on sync to update as there could be existing listings
  await knex('listings')
    .insert(listings)
    .catch((err) =>
      console.error(err));
};
