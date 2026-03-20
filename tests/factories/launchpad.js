'use strict';

const { StandardContract, User, Launchpad } = require('@models');
const { random } = require('lodash');
const randomstring = require('randomstring');
const { faker } = require('@faker-js/faker');
const { Factory } = require('fishery');
const { randomAddress } = require('../helpers/test-utility');

async function createLaunchpadData() {
  const users = await User.query();
  const launchpadStdContract = await StandardContract.getActive(StandardContract.TYPES.LAUNCHPAD);
  return {
    standard_contract_id: launchpadStdContract.id,
    project_information: {
      test_info: 'project information',
    },
    collection_information: {
      logo: 'https://drive.google.com/uc?id=1gyq9nGmahePz4PLCodqbmQ9bJmIJJEwm',
      name: 'deployLaunchpad',
      banner: 'deployLaunchpad',
      symbol: randomstring.generate(8),
      creator: users[0].aura_address,
      discord: 'https://discord.com/invite/example',
      feature: 'https://sample.feature.com/1.png',
      twitter: 'https://twitter.com/sample',
      website: 'https://sample.website.com/',
      category: 'Music',
      telegram: 'https://web.telegram.org/z/#sample',
      max_supply: 1000,
      uri_prefix: 'ipfs://prefix/',
      uri_suffix: '.json',
      description: '.',
      royalty_percentage: 10,
      royalty_payment_address: users[1].aura_address,
    },
  };
}

const LaunchPadFactory = Factory.define(() =>
  ({
    standard_contract_id: 0,
    project_information: {
      test_info: faker.random.words(),
    },
    collection_information: {
      logo: faker.internet.url(),
      name: faker.random.words(),
      banner: faker.random.words(),
      symbol: faker.unique(faker.lorem.slug),
      creator: randomAddress(),
      discord: faker.internet.url(),
      feature: faker.internet.url(),
      twitter: faker.internet.url(),
      website: faker.internet.url(),
      category: 'Music',
      telegram: faker.internet.url(),
      max_supply: 10,
      uri_prefix: 'ipfs://prefix/',
      uri_suffix: '.json',
      token_id_offset: 0,
      reserved_tokens: [],
      description: '.',
      royalty_percentage: 10,
      royalty_payment_address: randomAddress(),
    },
  }));

module.exports = { createLaunchpadData, LaunchPadFactory };
