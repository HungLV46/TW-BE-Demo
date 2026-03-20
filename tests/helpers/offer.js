'use strict';

const dayjs = require('dayjs');
const _ = require('lodash');

async function makeOffer(client, offerer, marketplace, nft) {
  const endTime = dayjs().add(100, 'second').valueOf().toString() + '000000';

  const makeOfferMessage = {
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

  return client.execute(offerer.aura_address, marketplace.contract_address, makeOfferMessage, 'auto');
}

async function acceptOffer(client, marketplace, nft, offerer) {
  const acceptOfferMessage = {
    accept_nft_offer: {
      offerer: offerer.aura_address,
      nft: {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
      },
      funds_amount: '100',
    },
  };
  return client.execute(nft.owner_address, marketplace.contract_address, acceptOfferMessage, 'auto');
}

async function cancelOffer(client, offerer, marketplace, nfts) {
  const cancelOfferMessage = {
    cancel_offer: {
      nfts: nfts.map((nft) =>
        _.pick(nft, ['contract_address', 'token_id'])),
    },
  };

  return client.execute(offerer.aura_address, marketplace.contract_address, cancelOfferMessage, 'auto');
}

module.exports = { makeOffer, acceptOffer, cancelOffer };
