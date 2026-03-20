const chainConfig = require('../config/chain').defaultChain;
const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async (knex) => {
  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const accountAddress = (await wallet.getAccounts())[0].address;

  // Blockchain: instantiate marketplace contract
  const marketContract = await knex('standard_contracts').where({ name: 'nft-marketplace', status: 'active' }).first();
  const codeId = parseInt(marketContract.code_id, 10);
  const initMarketMsg = { owner: accountAddress };
  const funds = 'auto';
  const options = { admin: accountAddress };
  const initMarketResponse = await client.instantiate(
    accountAddress,
    codeId,
    initMarketMsg,
    `${codeId} instance`,
    funds,
    options,
  );

  // Blockchain: instantiate marketplace token contract
  const marketContractAddress = initMarketResponse.contractAddress;
  const tokenMsg = {
    name: 'vaura',
    symbol: 'vaura',
    decimals: 6,
    initial_balances: [],
    mint: { minter: accountAddress, cap: '1000000000000000' },
    marketplace_address: marketContractAddress,
    native_denom: chainConfig.denom,
  };
  const tokenContract = await knex('standard_contracts').where({ name: 'bidding-token', status: 'active' }).first();
  const tokenCodeId = parseInt(tokenContract.code_id, 10);
  const initTokenResponse = await client.instantiate(
    accountAddress,
    tokenCodeId,
    tokenMsg,
    `${tokenCodeId} instance`,
    funds,
    options,
  );

  // Blockchain: set token for marketplace
  const tokenContractAddress = initTokenResponse.contractAddress;
  const setTokenMsg = { edit_vaura_token: { token_address: tokenContractAddress } };
  await client.execute(accountAddress, marketContractAddress, setTokenMsg, funds);

  // Database: fake store represent marketplace and deployed contracts
  const marketplaceSubdomain = 'aura';
  await knex('stores').where('subdomain', marketplaceSubdomain).update('status', 'inactive');
  await knex('stores').insert({
    subdomain: marketplaceSubdomain,
    status: 'active',
    extra_information: null,
    standard_contract_id: marketContract.id,
    contract_address: marketContractAddress,
    owner_address: accountAddress,
  });

  await knex('deployed_contracts').insert([
    {
      contract_address: marketContractAddress,
      standard_contract_id: marketContract.id,
    },
    {
      contract_address: tokenContractAddress,
      standard_contract_id: tokenContract.id,
    },
  ]);
};
