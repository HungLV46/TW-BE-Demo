const { MsgStoreCode, MsgMigrateContract } = require('cosmjs-types/cosmwasm/wasm/v1/tx');
const fs = require('fs');
const pako = require('pako');
const crypto = require('crypto');
const { logs } = require('@cosmjs/stargate');
const assert = require('assert');

const chainConfig = require('../config/chain').defaultChain;
const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async (knex) => {
  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const deployerAddress = (await wallet.getAccounts())[0].address;

  let codeId = 2;

  // if this is not aura mainnet, we will store the code
  if (chainConfig.chainId !== 'xstaxy-1') {
    // load the wasm file
    const wasm = fs.readFileSync(`${process.cwd()}/seeds/wasm/nft_marketplace_012.wasm`);
    const checksum = crypto.createHash('sha256').update(wasm).digest('hex');
    const compressedWasm = pako.gzip(wasm, { level: 9 });
    const storeCodeMsg = {
      typeUrl: '/cosmwasm.wasm.v1.MsgStoreCode',
      value: MsgStoreCode.fromPartial({
        sender: deployerAddress,
        wasmByteCode: compressedWasm,
      }),
    };
    console.log('Deploy from address: ', deployerAddress);
    const response = await client.signAndBroadcast(
      deployerAddress,
      [storeCodeMsg],
      'auto',
      'Upload marketplace contract 0.1.2',
    );

    if (response.code !== 0) {
      console.log('Failed to upload marketplace contract');
      console.log(response);
      return;
    }
    console.log('Upload marketplace contract successfully');
    // insert the new code to db
    const rawLog = logs.parseRawLog(response.rawLog)[0];
    const logChecksum = logs.findAttribute([rawLog], 'store_code', 'code_checksum').value;
    codeId = logs.findAttribute([rawLog], 'store_code', 'code_id').value;
    if (logChecksum !== checksum) {
      throw Error('The tx.rawLog events order does not match with that of upload messages!');
    }

    // deactivate previous contract
    await knex('standard_contracts')
      .where({ name: 'nft-marketplace', status: 'active' })
      .update({ status: 'inactive' });

    // insert new contract with new code_id
    await knex('standard_contracts').insert({
      name: 'nft-marketplace',
      description: 'Standard contract for nft-marketplace version 0.1.2',
      code_id: codeId,
      status: 'active',
      checksum,
    });
  }

  console.log('CodeId', codeId);
  // we will get current marketplace contract from database
  const marketContract = await knex('stores')
    .join('standard_contracts', 'stores.standard_contract_id', '=', 'standard_contracts.id')
    .where({ subdomain: 'aura', 'stores.status': 'active' })
    .select('stores.id', 'stores.contract_address', 'standard_contracts.code_id')
    .first();

  console.log('Marketplace contract', marketContract);

  const stdContract = await knex('standard_contracts')
    .where({
      name: 'nft-marketplace',
      status: 'active',
    })
    .first();

  assert(stdContract.code_id !== marketContract.code_id, 'The code_id is not changed');

  // we will migrate marketplace contract to 0.1.2
  const migrateMsg = {
    typeUrl: '/cosmwasm.wasm.v1.MsgMigrateContract',
    value: MsgMigrateContract.fromPartial({
      sender: deployerAddress,
      contract: marketContract.contract_address,
      codeId,
      msg: Buffer.from('{}').toString('base64'),
    }),
  };

  const response = await client.signAndBroadcast(
    deployerAddress,
    [migrateMsg],
    'auto',
    'Migrate marketplace contract to 0.1.2',
  );

  if (response.code !== 0) {
    console.log('Failed to migrate marketplace contract to 0.1.2');
    console.log(response);
    return;
  }
  console.log('Migrate marketplace contract to 0.1.2 successfully');
  console.log(response);

  // we will insert a new row to store with new code_id for clarity
  await knex('stores').where({ id: marketContract.id }).update({ status: 'inactive' });
  await knex('stores').insert({
    subdomain: 'aura',
    contract_address: marketContract.contract_address,
    standard_contract_id: stdContract.id,
    status: 'active',
  });
  await knex('deployed_contracts')
    .where({ contract_address: marketContract.contract_address })
    .update({ standard_contract_id: stdContract.id });
};
