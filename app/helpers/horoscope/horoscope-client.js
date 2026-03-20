'use strict';

const axios = require('axios').default;

const { HOROSCOPE_GRAPHQL_URL, HOROSCOPE_DATABASE_NAME } = require('@config/horoscope');

class HoroscopeClient {
  static async graphQLGet(query, variables = {}, operationName) {
    return axios
      .post(
        HOROSCOPE_GRAPHQL_URL,
        {
          query,
          variables,
          operationName,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
      .then((response) => {
        const errors = response.data.errors;
        if (errors) {
          throw new Error(JSON.stringify(errors));
        }
        return response.data.data[HOROSCOPE_DATABASE_NAME];
      });
  }

  static async getNft({ contract_address, token_id }) {
    const operationName = 'getNft';
    const query = `
      query ${operationName}($contract_address: String = "", $token_id: String = "") {
        ${HOROSCOPE_DATABASE_NAME} {
          cw721_token(where: {token_id: {_eq: $token_id}, cw721_contract: {smart_contract: {address: {_eq: $contract_address}}}}, limit: 1) {
            cw721_contract {
              smart_contract {
                address
              }
            }
            token_id
            media_info
            owner
            burned
          }
        }
      }
      `;

    return this.graphQLGet(query, { contract_address, token_id }, operationName).then((response) => {
      const token = response.cw721_token[0];

      if (!token) return {};

      const metadata = token.media_info?.onchain?.metadata || {};

      if (!metadata) return {};

      const offchain = token.media_info?.offchain;
      metadata.s3_image = offchain?.image?.url;
      metadata.s3_animation = offchain?.animation?.url;

      return {
        name: metadata?.name,
        contract_address,
        token_id,
        owner_address: token.owner,
        metadata,
        token_uri: token.token_uri,
      };
    });
  }

  static async getNftActivities({ synced_id, limit, contract_code_ids }) {
    const operationName = 'getNftActivities';
    const query = `
      query ${operationName}($synced_id: Int = 0, $limit: Int = 10, $code_ids: [Int!] = []) {
        ${HOROSCOPE_DATABASE_NAME} {
          cw721_activity(where: {id: {_gt: $synced_id}, cw721_contract: {smart_contract: {code_id: {_in: $code_ids}}}}, order_by: {id: asc}, limit: $limit) {
            id
            action
            from
            to
            cw721_contract {
              smart_contract {
                address
              }
            }
            cw721_token {
              token_id
            }
            tx {
              height
              index
              hash
              timestamp
            }
          }
        }
      }`;

    const activities = await this.graphQLGet(
      query,
      { synced_id, limit, code_ids: contract_code_ids },
      operationName,
    ).then((response) => response.cw721_activity);

    return activities.map((activity) => ({
      cw721_activity_id: activity.id,
      transaction_hash: activity.tx.hash,
      event: activity.action,
      from_address: activity.from,
      to_address: activity.to,
      token_id: activity.cw721_token?.token_id,
      transaction_time: activity.tx.timestamp,
      contract_address: activity.cw721_contract.smart_contract.address,
      block_height: activity.tx.height,
    }));
  }
}

module.exports = HoroscopeClient;
