const fs = require('fs');
const crypto = require('crypto');
const pako = require('pako');

const { MsgStoreCode } = require('cosmjs-types/cosmwasm/wasm/v1/tx');
const { logs } = require('@cosmjs/stargate');

const _ = require('lodash');

const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');

const knex = require('../config/database');
const chainConfig = require('../config/chain').defaultChain;

const contractInfos = [
  { dir: `${process.cwd()}/seeds/wasm/cw2981_royalties.wasm`, name: 'cw2981-royalties' },
  { dir: `${process.cwd()}/seeds/wasm/nft_marketplace.wasm`, name: 'nft-marketplace' },
  { dir: `${process.cwd()}/seeds/wasm/bidding_token.wasm`, name: 'bidding-token' },
  { dir: `${process.cwd()}/seeds/wasm/nft_auction.wasm`, name: 'nft-auction' },
];

let uploadedMarketplace = false;
let uploadedMarketplaceToken = false;
let uploadedAuction = false;

async function uploadContracts(knex, client, deployerAddress, contractInfoToUpload) {
  const uploadMsgs = contractInfoToUpload.map((info) => {
    const compressed = pako.gzip(info.wasm, { level: 9 });
    return {
      typeUrl: '/cosmwasm.wasm.v1.MsgStoreCode',
      value: MsgStoreCode.fromPartial({
        sender: deployerAddress,
        wasmByteCode: compressed,
      }),
    };
  });
  const response = await client.signAndBroadcast(deployerAddress, uploadMsgs, 'auto', 'Upload twilight contracts');
  console.log(`Contracts uploaded to blockchain. TxHash: ${response.transactionHash}`);

  // Database: update standard contracts
  // convert tx.rawLog to standard_contracts records
  const standardContracts = logs.parseRawLog(response.rawLog).map((parsedLog) => {
    const contractInfo = contractInfoToUpload[parsedLog.msg_index];
    const logChecksum = logs.findAttribute([parsedLog], 'store_code', 'code_checksum').value;

    // For simplicity, this function map contract's names with contract's code IDs based on the assumption
    // that the order of events in tx.rawLog and that of upload messages are the same.
    // The checksums are used to check that the assumption is correct (so code IDs are mapped with correct contract's names).
    // TODO find official document about tx.rawLog's order and execution messages order
    if (logChecksum !== contractInfo.checksum) {
      throw Error('The tx.rawLog events order does not match with that of upload messages!');
    }

    const name = contractInfo.name;
    const codeId = logs.findAttribute([parsedLog], 'store_code', 'code_id').value;
    return {
      name,
      code_id: parseInt(codeId, 10),
      status: 'active',
      description: `Standard contract for ${name}`,
      checksum: logChecksum,
      created_at: new Date(),
      updated_at: new Date(),
    };
  });

  // invalidate outdated contracts and insert new ones
  await knex('standard_contracts')
    .whereIn(
      'name',
      contractInfoToUpload.map((info) =>
        info.name),
    )
    .where('status', 'active')
    .update({ status: 'inactive' });
  const uploadedContracts = await knex('standard_contracts').insert(standardContracts).returning(['name', 'code_id', 'checksum']);
  console.log('=> Upload result: success'); uploadedContracts.forEach(c => console.log(`  ${JSON.stringify(c)}`)); // print results
}

// the same as seeds/00_standard_contracts.js
async function uploadStandardContract() {
  console.log('=========================');
  console.log('Upload standard contracts');
  console.log('=========================');
  
  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const deployerAddress = (await wallet.getAccounts())[0].address;

  const contracts = await knex('standard_contracts').where('status', 'active');
  const contractByName = _.keyBy(contracts, 'name');

  console.log('Filter out uploaded contracts');
  const contractInfoToUpload = contractInfos
    .map((info) => {
      const wasm = fs.readFileSync(info.dir);
      const checksum = crypto.createHash('sha256').update(wasm).digest('hex');
      return { wasm, checksum, name: info.name };
    })
    .filter((info) => {
      const contractName = info.name;
      if (contractByName[contractName] && info.checksum === contractByName[contractName].checksum) {
        console.log(`  skip ${contractName}`);
        if(contractName == 'nft-marketplace') { uploadedMarketplace = true; }
        if(contractName == 'bidding-token') { uploadedMarketplaceToken = true; }
        if(contractName == 'nft-auction') { uploadedAuction = true; }
        return false;
      }

      console.log(`  deploying ${contractName}`);
      return true;
    });

  if (_.isEmpty(contractInfoToUpload)) { console.log('=> Upload result: Nothing to upload!'); return };

  // upload 4 contracts per transaction
  const uploadSize = 4;
  for (let i = 0; i < contractInfoToUpload.length; i += uploadSize) {
    // eslint-disable-next-line no-await-in-loop
    await uploadContracts(knex, client, deployerAddress, contractInfoToUpload.slice(i, i + uploadSize));
  }
};

// the same as seeds/09_marketplace.js
async function setUpMarketPlace() {
  if(uploadedMarketplace && uploadedMarketplaceToken) return;

  console.log('\n=========================');
  console.log('Setup market place');
  console.log('=========================');

  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const accountAddress = (await wallet.getAccounts())[0].address;

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
  console.log(`Blockchain: instantiate marketplace success. TxHash: ${initMarketResponse.transactionHash}`);

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
  console.log(`Blockchain: instantiate bidding token success. TxHash: ${initTokenResponse.transactionHash}`);

  const tokenContractAddress = initTokenResponse.contractAddress;
  const setTokenMsg = { edit_vaura_token: { token_address: tokenContractAddress } };
  const setTokenResponse = await client.execute(accountAddress, marketContractAddress, setTokenMsg, funds);
  console.log(`Blockchain: set token for marketplace success. TxHash: ${setTokenResponse.transactionHash}`);

  const marketplaceSubdomain = 'aura';
  await knex('stores').where('subdomain', marketplaceSubdomain).update('status', 'inactive');
  const store = await knex('stores').insert({
    subdomain: marketplaceSubdomain,
    status: 'active',
    extra_information: null,
    standard_contract_id: marketContract.id,
    contract_address: marketContractAddress,
    owner_address: accountAddress,
  }).returning(['subdomain', 'contract_address', 'owner_address']);

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
  console.log('=> Setup marketplace success'); console.log(`  ${JSON.stringify(store)}`); // print result
};

async function setUpAuction() {
  if(uploadedAuction) return;

  console.log('\n=========================');
  console.log('Setup Auction place');
  console.log('=========================');

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
  console.log(`Blockchain: instantiate auction success. TxHash: ${initAuctionResponse.transactionHash}`);

  // Database: fake store represent auction and deployed contracts
  const auctionSubdomain = 'aura-auction';
  const auctionContractAddress = initAuctionResponse.contractAddress;
  await knex('stores').where('subdomain', auctionSubdomain).update('status', 'inactive');
  const store = await knex('stores').insert({
    subdomain: auctionSubdomain,
    status: 'active',
    extra_information: null,
    standard_contract_id: auctionContract.id,
    contract_address: auctionContractAddress,
    owner_address: ownerAddress,
  }).returning(['subdomain', 'contract_address', 'owner_address']);

  await knex('deployed_contracts').insert({
    contract_address: auctionContractAddress,
    standard_contract_id: auctionContract.id,
  });
  console.log('=> Setup auction success'); console.log(`  ${JSON.stringify(store)}`); // print result
}

uploadStandardContract()
.then(() => setUpMarketPlace())
.then(() => setUpAuction())
.then(() => knex.destroy());
