const fs = require('fs');
const crypto = require('crypto');
const pako = require('pako');

const { MsgStoreCode } = require('cosmjs-types/cosmwasm/wasm/v1/tx');
const { logs } = require('@cosmjs/stargate');

const _ = require('lodash');

const chainConfig = require('../config/chain').defaultChain;
const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');

const contractInfos = [
  { dir: `${process.cwd()}/seeds/wasm/cw2981_royalties.wasm`, name: 'cw2981-royalties' },
  { dir: `${process.cwd()}/seeds/wasm/nft_marketplace.wasm`, name: 'nft-marketplace' },
  { dir: `${process.cwd()}/seeds/wasm/bidding_token.wasm`, name: 'bidding-token' },
  { dir: `${process.cwd()}/seeds/wasm/nft_launchpad.wasm`, name: 'nft-launchpad' },
  { dir: `${process.cwd()}/seeds/wasm/nft_auction.wasm`, name: 'nft-auction' },
];

async function uploadContracts(knex, client, deployerAddress, contractInfoToUpload) {
  // Blockchain: upload contracts
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
  await knex('standard_contracts').insert(standardContracts);
}

// Upload contracts specified by "contractInfos" above to blockchain, and create corresponding records in standard_contracts table
exports.seed = async (knex) => {
  // Deletes ALL existing entries
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('standard_contracts').del();
  }
  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const deployerAddress = (await wallet.getAccounts())[0].address;

  const contracts = await knex('standard_contracts').where('status', 'active');
  const contractByName = _.keyBy(contracts, 'name');

  // Filter out uploaded contracts
  const contractInfoToUpload = contractInfos
    .map((info) => {
      const wasm = fs.readFileSync(info.dir);
      const checksum = crypto.createHash('sha256').update(wasm).digest('hex');
      return { wasm, checksum, name: info.name };
    })
    .filter((info) => {
      const contractName = info.name;
      if (contractByName[contractName] && info.checksum === contractByName[contractName].checksum) {
        console.log(`skip ${contractName}`);
        return false;
      }

      return true;
    });

  if (_.isEmpty(contractInfoToUpload)) return;

  // upload 4 contracts per transaction
  const uploadSize = 4;
  for (let i = 0; i < contractInfoToUpload.length; i += uploadSize) {
    // eslint-disable-next-line no-await-in-loop
    await uploadContracts(knex, client, deployerAddress, contractInfoToUpload.slice(i, i + uploadSize));
  }
};
