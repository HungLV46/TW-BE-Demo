const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');
const { randomAddress } = require('../helpers/test-utility');
const dayjs = require('dayjs');
const { Listing } = require('@models');

const ListingFactory = Factory.define(() =>
  ({
    seller_address: randomAddress(),
    token_id: faker.datatype.hexadecimal(32),
    contract_address: randomAddress(),
    store_address: randomAddress(),
    status: Listing.STATUSES.ONGOING,
    auction_config: {},
    end_time: dayjs().add(10, 'min'),
  }));

module.exports = ListingFactory;
