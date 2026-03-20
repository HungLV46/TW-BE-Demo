'use strict';

const { coin, coins } = require('@cosmjs/proto-signing');
const dayjs = require('dayjs');
const chainConfig = require('@config/chain').defaultChain;

async function createAuction(client, auction, nft, startTime, endTime) {
  const createMessage = {
    auction_nft: {
      nft: {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
      },
      auction_config: {
        english_auction: {
          start_price: coin(1000, chainConfig.denom),
          step_percentage: 5,
          buyout_price: '12000',
          start_time: {
            at_time: startTime || dayjs().add(100, 'second').valueOf().toString() + '000000',
          },
          end_time: {
            at_time: endTime || dayjs().add(300, 'second').valueOf().toString() + '000000',
          },
        },
      },
    },
  };

  const response = await client.execute(nft.owner_address, auction.contract_address, createMessage, 'auto');

  return {
    ...response,
    english_auction: createMessage.auction_nft.auction_config.english_auction,
  };
}

async function createBid(client, auction, nft, bidderAddress, bidPrice = '10000') {
  const bidMessage = {
    bid_auction: {
      nft: {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
      },
      bid_price: bidPrice.toString(),
    },
  };
  const response = await client.execute(
    bidderAddress,
    auction.contract_address,
    bidMessage,
    'auto',
    'create bid',
    coins(bidPrice, chainConfig.denom),
  );

  return {
    ...response,
    bid_price: bidPrice,
  };
}

async function settleAuction(client, auction, nft, settlerAddress) {
  const settleMessage = {
    settle_auction: {
      nft: {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
      },
    },
  };
  return client.execute(settlerAddress, auction.contract_address, settleMessage, 'auto');
}

module.exports = {
  createAuction,
  createBid,
  settleAuction,
};
