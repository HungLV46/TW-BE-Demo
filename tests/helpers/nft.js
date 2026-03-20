'use strict';

const dayjs = require('dayjs');

async function approveNft(client, nft, spender) {
  const approveMsg = {
    approve: {
      spender: spender,
      token_id: nft.token_id,
      expires: {
        never: {},
      },
    },
  };
  return client.execute(nft.owner_address, nft.contract_address, approveMsg, 'auto');
}

async function transferNft(client, nft, recipient) {
  const transferMsg = {
    transfer_nft: {
      recipient: recipient,
      token_id: nft.token_id,
    },
  };
  return client.execute(nft.owner_address, nft.contract_address, transferMsg, 'auto');
}

async function offerNft(client, offerer, nft, marketplace, price) {
  const offerMessage = {
    offer_nft: {
      nft: {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
      },
      funds_amount: price.toString(),
      end_time: {
        at_time: dayjs().add(100, 'second').valueOf().toString() + '000000',
      },
    },
  };
  return client.execute(offerer.aura_address, marketplace.contract_address, offerMessage, 'auto');
}

async function acceptOffer(client, owner, offerer, nft, marketplace, offerPrice) {
  const offerMessage = {
    accept_nft_offer: {
      offerer: offerer.aura_address,
      nft: {
        contract_address: nft.contract_address,
        token_id: nft.token_id,
      },
      funds_amount: offerPrice.toString(),
    },
  };

  return client.execute(owner.aura_address, marketplace.contract_address, offerMessage, 'auto');
}

module.exports = {
  approveNft,
  transferNft,
  offerNft,
  acceptOffer,
};
