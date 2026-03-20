const chainConfig = require('../config/chain').defaultChain;
const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');

exports.seed = async (knex) => {
  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const ownerAddress = (await wallet.getAccounts())[0].address;

  // Blockchain: instantiate auction contract
  const auctionContract = await knex('standard_contracts').where({ name: 'nft-auction', status: 'active' }).first();
  const codeId = parseInt(auctionContract.code_id, 10);
  const initAuctionMsg = { owner: ownerAddress };
  const funds = 'auto';
  const options = { admin: ownerAddress };
  const initAuctionResponse = await client.instantiate(
    ownerAddress,
    codeId,
    initAuctionMsg,
    `${codeId} instance`,
    funds,
    options,
  );

  // Database: fake store represent auction and deployed contracts
  const auctionSubdomain = 'aura-auction';
  const auctionContractAddress = initAuctionResponse.contractAddress;
  await knex('stores').where('subdomain', auctionSubdomain).update('status', 'inactive');
  await knex('stores').insert({
    subdomain: auctionSubdomain,
    status: 'active',
    extra_information: null,
    standard_contract_id: auctionContract.id,
    contract_address: auctionContractAddress,
    owner_address: ownerAddress,
  });

  await knex('deployed_contracts').insert({
    contract_address: auctionContractAddress,
    standard_contract_id: auctionContract.id,
  });
};
