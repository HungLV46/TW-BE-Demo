'use strict';

const { Model } = require('objection');
const BaseModel = require('./base_model');

class NftHistory extends BaseModel {
  static get tableName() {
    return 'nft_histories';
  }

  static get relationMappings() {
    return {
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: 'nft',
        join: {
          from: 'nft_histories.token_id',
          to: 'nfts.token_id',
        },
      },
    };
  }

  static get EVENTS() {
    return {
      MINT: 'mint',
      SEND: 'send_nft',
      TRANSFER: 'transfer_nft',
      BURN: 'burn',
      LIST: 'list',
      LIST_CANCELLED: 'list_cancelled',
      BUY: 'buy',
      OFFER: 'offer',
      OFFER_CANCELLED: 'offer_cancelled',
      PLACE_BID: 'place_bid',
      COIN_TRANSFERED: 'coin_transfered',
    };
  }

  static get selectableProps() {
    return [
      'nft_histories.id as id',
      'nft_histories.transaction_hash as transaction_hash',
      'nft_histories.event as event',
      'nft_histories.decimal as decimal',
      'nft_histories.unit as unit',
      'nft_histories.from_address as from_address',
      'nft_histories.to_address as to_address',
      'nft_histories.token_id as token_id',
      'nft_histories.transaction_time as transaction_time',
      'nft_histories.contract_address as contract_address',
    ];
  }

  static get jsonAttributes() {
    return ['price'];
  }
}

module.exports = NftHistory;
