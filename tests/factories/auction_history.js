const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');
const { randomAddress } = require('../helpers/test-utility');
const { AuctionHistory } = require('@models');

const AuctionHistoryFactory = Factory.define(() =>
  ({
    auction_event: AuctionHistory.EVENTS.CREATE,
    contract_address: randomAddress(),
    token_id: faker.datatype.hexadecimal(32),
    auction_address: randomAddress(),
  }));

module.exports = AuctionHistoryFactory;
