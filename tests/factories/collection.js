const { Factory } = require('fishery');
const { faker } = require('@faker-js/faker');

const CollectionFactory = Factory.define(() => {
  const name = faker.commerce.productName();
  return {
    name,
    symbol: name
      .replace(/[aeiou\s]/gi, '')
      .slice(0, 5)
      .toUpperCase(),
    slug: name.replaceAll(' ', '-') + '-' + faker.random.numeric(3),
    contract_address: `aura${faker.random.alpha(39)}`,
    minter_address: `aura${faker.random.alpha(39)}`,
    owner_address: `aura${faker.random.alpha(39)}`,
    royalty_percentage: 15,
    royalty_payment_address: `aura${faker.random.alpha(39)}`,
  };
});

module.exports = CollectionFactory;
