const { faker } = require('@faker-js/faker');

const createSuccessResponse = (activitiesData) =>
  Promise.resolve({
    status: 200,
    data: {
      data: {
        test_database: {
          cw721_activity: activitiesData.map((data) =>
            ({
              id: data.id,
              action: data.action,
              from: data.from,
              to: data.to,
              cw721_contract: {
                smart_contract: {
                  address: data.contract_address,
                },
              },
              cw721_token: {
                token_id: data.token_id,
              },
              tx: {
                height: data.height,
                index: data.index || 1,
                hash: data.hash,
                timestamp: new Date(),
              },
            })),
        },
      },
    },
  });

const getNftResponse = ({
  contract_address, token_id, attributes, owner, burned, name
}) =>
  Promise.resolve({
    status: 200,
    data: {
      data: {
        test_database: {
          cw721_token: [
            {
              cw721_contract: {
                smart_contract: {
                  address: contract_address,
                },
              },
              token_id,
              media_info: {
                onchain: {
                  metadata: {
                    name: name || faker.commerce.productName(),
                    image: faker.image.imageUrl(),
                    attributes,
                    description: faker.commerce.productDescription(),
                  },
                  token_uri: 'ipfs://token_uri/19.json',
                },
                offchain: {
                  image: {
                    url: faker.image.imageUrl(),
                    file_path: 'ipfs/ipfs-path/image.jpg',
                    content_type: 'image/jpeg',
                  },
                  animation: {
                    url: faker.image.imageUrl(),
                    file_path: 'ipfs/ipfs-path/video.mp4',
                    content_type: 'video/mp4',
                  },
                },
              },
              owner: owner,
              burned: burned || false,
            },
          ],
        },
      },
    },
  });

module.exports = { createSuccessResponse, getNftResponse };
