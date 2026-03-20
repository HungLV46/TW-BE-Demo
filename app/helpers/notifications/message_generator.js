'use strict';

const EVENT = {
  TRADE: 'trade',
};

const MESSAGE_TYPE = {
  BUY_BUYER: 'BUY_BUYER',
  BUY_SELLER: 'BUY_SELLER',
  MAKE_OFFER: 'MAKE_OFFER',
  ACCEPT_OFFER_BUYER: 'ACCEPT_OFFER_BUYER',
  ACCEPT_OFFER_SELLER: 'ACCEPT_OFFER_SELLER',
  CHANGE_PRICE: 'CHANGE_PRICE',
  RECEIVED_BID: 'RECEIVED_BID',
  AUCTION_ENDED_SELLER: 'AUCTION_ENDED_SELLER',
  AUCTION_ENDED_BUYER: 'AUCTION_ENDED_BUYER',
  AUCTION_SETTLED_BUYER: 'AUCTION_SETTLED_BUYER',
  AUCTION_SETTLED_SELLER: 'AUCTION_SETTLED_SELLER',
  OUTBID_REFUND: 'OUTBID_REFUND',
};

function generateTradeContent({
  message_type, nft, price, transaction_hash
}) {
  const content = {};

  const nftName = nft.name || `#${nft.token_id}`;
  const convertedPrice = price ? (Number(price) / 1000000).toString() : undefined;

  switch (message_type) {
    case MESSAGE_TYPE.BUY_BUYER:
      content.notification = {
        title: 'Purchased an NFT',
        body: `You have purchased ${nftName} for ${convertedPrice} AURA.`,
      };
      break;
    case MESSAGE_TYPE.BUY_SELLER:
      content.notification = {
        title: 'Sold an NFT',
        body: `You have sold ${nftName} for ${convertedPrice} AURA.`,
      };
      break;
    case MESSAGE_TYPE.MAKE_OFFER:
      content.notification = {
        title: 'Received an offer',
        body: `You have an offer of ${convertedPrice} AURA for ${nftName}.`,
      };
      break;
    case MESSAGE_TYPE.ACCEPT_OFFER_BUYER:
      content.notification = {
        title: 'Purchased an NFT',
        body: `Your offer on ${nftName} for ${convertedPrice} AURA has been accepted.`,
      };
      break;
    case MESSAGE_TYPE.ACCEPT_OFFER_SELLER:
      content.notification = {
        title: 'Sold an NFT',
        body: `You have sold ${nftName} for ${convertedPrice} AURA.`,
      };
      break;
    case MESSAGE_TYPE.CHANGE_PRICE:
      content.notification = {
        title: 'Price change',
        body: `${nftName} is listed for ${convertedPrice} AURA`,
      };
      break;
    case MESSAGE_TYPE.RECEIVED_BID:
      content.notification = {
        title: 'Received a bid',
        body: `You have a bid of ${convertedPrice} AURA for ${nftName}.`,
      };
      break;
    case MESSAGE_TYPE.AUCTION_ENDED_SELLER:
      content.notification = {
        title: 'Auction has ended',
        body: `The auction for ${nftName} has ended, please settle the auction.`,
      };
      break;
    case MESSAGE_TYPE.AUCTION_ENDED_BUYER:
      content.notification = {
        title: 'Auction has ended',
        body: `The auction for ${nftName} has ended, please settle the auction.`,
      };
      break;
    case MESSAGE_TYPE.AUCTION_SETTLED_BUYER:
      content.notification = {
        title: 'Purchased an NFT',
        body: `You have purchased ${nftName} for ${convertedPrice} AURA.`,
      };
      break;
    case MESSAGE_TYPE.AUCTION_SETTLED_SELLER:
      content.notification = {
        title: 'Sold an NFT',
        body: `You have sold ${nftName} for ${convertedPrice} AURA.`,
      };
      break;
    case MESSAGE_TYPE.OUTBID_REFUND:
      content.notification = {
        title: 'Outbid and Refund',
        body: `A higher bid than yours has just been placed on ${nftName} and you have been refunded ${convertedPrice} AURA.`,
      };
      break;
    default:
      throw new Error(`Invalid message type: ${message_type}`);
  }

  content.notification.imageUrl = nft.getImageUrl();

  content.data = {
    type: message_type,
    collection_slug: nft.collection.slug,
    contract_address: nft.contract_address,
    token_id: nft.token_id,
    nft_name: nftName,
    nft_price: convertedPrice,
    time: Date.now().toString(),
    transaction_hash: transaction_hash,
  };

  return content;
}

function generateMessage(event, data) {
  switch (event) {
    case EVENT.TRADE:
      return generateTradeContent(data);
    default:
      throw new Error(`Invalid event type: ${event}`);
  }
}

module.exports = { generateMessage, EVENT, MESSAGE_TYPE };
