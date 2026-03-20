const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');
const { randomAddress } = require('../helpers/test-utility');

const NftFactory = Factory.define(() => {
  const nftName = faker.random.words();
  return {
    name: nftName,
    token_id: faker.datatype.hexadecimal(32),
    owner_address: randomAddress(),
    contract_address: randomAddress(),
    metadata: {
      name: nftName,
      s3_image: faker.image.imageUrl(),
    },
  };
});
module.exports = NftFactory;
