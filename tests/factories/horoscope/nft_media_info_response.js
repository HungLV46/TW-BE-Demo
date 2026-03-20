const { faker } = require('@faker-js/faker');

const NftMediaInfoSuccessResponse = {
  status: 200,
  data: {
    data: {
      test_database: {
        cw721_token: [
          {
            media_info: {
              onchain: {
                metadata: {
                  name: faker.commerce.productName(),
                },
              },
              offchain: {
                image: {
                  url: faker.image.imageUrl(),
                },
                animation: {
                  url: faker.image.imageUrl(),
                },
              },
            },
          },
        ],
      },
    },
  },
};

const NftMediaInfoEmptyResponse = {
  status: 200,
  data: {
    data: {
      test_database: {
        cw721_token: [
          {
            media_info: {
              offchain: {
                image: {},
                animation: {},
              },
            },
          },
        ],
      },
    },
  },
};

module.exports = { NftMediaInfoSuccessResponse, NftMediaInfoEmptyResponse };
