'use strict';

const chainConfig = require('@config/chain').defaultChain;
const dayjs = require('dayjs');
const _ = require('lodash');

const { coins } = require('@cosmjs/proto-signing');
const { toUtf8 } = require('@cosmjs/encoding');

function getLatestPrice(auctionConfig) {
  // TODO convert to a unified currency (maybe USD) for comparison
  // TODO generate latest_price for others type_id
  // currently return amount in Aura

  if (auctionConfig.config.fixed_price) {
    return parseInt(auctionConfig.config.fixed_price.price.amount, 10);
  }

  if (auctionConfig.config.english_auction) {
    return parseInt(auctionConfig.config.english_auction.start_price.amount, 10);
  }

  return 0;
}
// parse expiration time
function parseExpirationTime(expirationTime, { blockHeight, blockTime } = {}) {
  if (expirationTime) {
    if (_.get(expirationTime, 'at_height')) {
      // estimate expiration time by block height
      return dayjs(blockTime).add(
        (expirationTime.at_height - blockHeight) * chainConfig.averageBlockTimeMs,
        'millisecond',
      );
    }
    if (_.get(expirationTime, 'at_time')) {
      // dayjs takes time in milliseconds while expirationTime.at_time is in nanoseconds
      return dayjs(parseInt(expirationTime.at_time.slice(0, 13), 10));
    }
  }
  // we treat never the same as null, which means no expiration
  return null;
}

function listNft(client, user, nft, store, auctionConfig) {
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
  const listMsg = {
    list_nft: {
      contract_address: nft.contract_address,
      token_id: nft.token_id,
      auction_config: auctionConfig,
    },
  };

  const msgs = [
    {
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: {
        sender: user.aura_address,
        contract: nft.contract_address,
        msg: toUtf8(JSON.stringify(approveMsg)),
      },
    },
    {
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: {
        sender: user.aura_address,
        contract: store.contract_address,
        msg: toUtf8(JSON.stringify(listMsg)),
      },
    },
  ];
  return client.signAndBroadcast(user.aura_address, msgs, 'auto');
}

async function cancelListing(client, user, listing) {
  const msg = {
    cancel: {
      contract_address: listing.contract_address,
      token_id: listing.token_id,
    },
  };
  return client.execute(user.aura_address, listing.store_address, msg, 'auto');
}

async function buyListing(client, user, listing) {
  const msg = {
    buy: {
      contract_address: listing.contract_address,
      token_id: listing.token_id,
    },
  };

  const price = listing.auction_config.config.fixed_price.price;

  return client.execute(
    user.aura_address,
    listing.store_address,
    msg,
    'auto',
    'buy listing',
    coins(price.amount, price.denom),
  );
}

module.exports = {
  getLatestPrice,
  parseExpirationTime,
  listNft,
  cancelListing,
  buyListing,
};
