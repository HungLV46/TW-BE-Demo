const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');
const { getUserAddress } = require('../helpers/test-utility');

const UserFactory = Factory.define(({ sequence }) => {
  return {
    aura_address: getUserAddress(sequence),
    name: faker.internet.userName() + ' ' + sequence,
    avatar: faker.image.people(200, 200, true).replace('?', '?lock='),
    cover_picture: faker.image.people(200, 200, true).replace('?', '?lock='),
  };
});

module.exports = { UserFactory };
