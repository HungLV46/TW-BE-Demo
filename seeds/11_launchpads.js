if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('DO NOT RUN IN PRODUCTION!!');
  throw new Error('production environment not supported');
}

const { faker } = require('@faker-js/faker');
const dayjs = require('dayjs');

const { MsgInstantiateContract } = require('cosmjs-types/cosmwasm/wasm/v1/tx');
const { toUtf8 } = require('@cosmjs/encoding');
const { logs } = require('@cosmjs/stargate');

const chainConfig = require('../config/chain').defaultChain;
const { setupBlockchainClient, findAttributeValueFromEvents } = require('../app/helpers/blockchain_utils');

const _ = require('lodash');

const NO_LAUNCHPADS = process.env.NO_LAUNCHPADS || 1;
const NO_MINT_PHASES = process.env.NO_MINT_PHASES || 2;

const fs = require('fs');
const { create } = require('ipfs-http-client');

async function uploadExampleLaunchpadMetadataToIpfs() {
  const ipfsClient = create({ url: process.env.IPFS_GATEWAY || 'http://localhost:5001' });

  const imageDirPath = '/image';
  const metadataDirPath = '/metadata';
  try {
    await ipfsClient.files.mkdir(imageDirPath);
    await ipfsClient.files.mkdir(metadataDirPath);
  } catch {
    // ignore error
  }

  const uploadImagePromises = _.range(1, 7).map((index) => {
    const content = fs.readFileSync(`./seeds/example/images/${index}.jpg`);
    return ipfsClient.files.write(`${imageDirPath}/${index}.jpg`, content, { create: true });
  });

  const uploadMetadataPromises = _.range(1, 7).map((index) => {
    const content = JSON.stringify({
      name: 'xx#1',
      description: 'xx collection description.',
      attributes: [
        { trait_type: 'IMAGE', value: 'image.url/1.png' },
        { trait_type: 'BACKGROUND', value: 'green' },
      ],
      image: `ipfs://QmTcmHMGj1roL6niU9SjMBqvb1wNCtsYpL8qR7qXrNdaD8/${index}.jpg`,
    });
    return ipfsClient.files.write(`${metadataDirPath}/${index}.json`, content, { create: true });
  });

  await Promise.all([...uploadImagePromises, ...uploadMetadataPromises]);

  return ipfsClient.files.stat(metadataDirPath).then((response) => response.cid.toString());
}

/**
 * Instantiate NO_LAUNCHPADS number of launchpads
 *
 * @returns instantiated launchpads and corresponding collections
 */
async function instantiateLaunchpad(instantiatorAddress) {
  const launchpadContract = await this.knex('standard_contracts')
    .where({ name: 'nft-launchpad', status: 'active' })
    .first();
  const cw2981Contract = await this.knex('standard_contracts')
    .where({ name: 'cw2981-royalties', status: 'active' })
    .first();
  const users = await this.knex('users').orderBy('id', 'asc');

  const metadataCID = await uploadExampleLaunchpadMetadataToIpfs();

  // Blockchain: instantiate launchpad
  const msgs = _.range(NO_LAUNCHPADS).map((index) => {
    const name = faker.commerce.productName();
    return {
      random_seed: '9e8e26615f51552aa3b18b6f0bcf0dae5afbe30321e8d1237fa51ebeb1d8fe62',
      colection_code_id: parseInt(cw2981Contract.code_id, 10),
      launchpad_fee: 0,
      launchpad_collector: instantiatorAddress,
      collection_info: {
        name: name,
        symbol: name
          .replace(/[aeiou\s]/gi, '')
          .slice(0, 5)
          .toUpperCase(),
        royalty_percentage: 15,
        royalty_payment_address: users[index % users.length].aura_address,
        max_supply: 6,
        uri_prefix: `ipfs://${metadataCID}/`,
        uri_suffix: '.json',
        creator: users[index % users.length].aura_address,
      },
    };
  });
  const instantiateContractMsgs = msgs.map((msg) => ({
    typeUrl: '/cosmwasm.wasm.v1.MsgInstantiateContract',
    value: MsgInstantiateContract.fromPartial({
      sender: instantiatorAddress,
      codeId: parseInt(launchpadContract.code_id, 10),
      label: `${launchpadContract.code_id} instance`,
      msg: toUtf8(JSON.stringify(msg)),
    }),
  }));
  const response = await this.client.signAndBroadcast(instantiatorAddress, instantiateContractMsgs, 'auto');

  // DB: insert launchpads and collections
  const launchpads = [];
  const collections = [];
  const deployedContracts = [];
  const lastCollectionId = (await this.knex('collections').max('id'))[0].max;
  logs.parseRawLog(response.rawLog).forEach((parsedLog) => {
    const index = parsedLog.msg_index; // TODO check if msg_index is the same as index of messages array
    const msg = msgs[index];
    const name = msg.collection_info.name;

    const launchpadContractAddress = findAttributeValueFromEvents(parsedLog.events, 'reply', '_contract_address').value;
    const collectionContractAddress = findAttributeValueFromEvents(
      parsedLog.events,
      'wasm',
      'collection_address',
    ).value;
    const image = faker.image.cats(200, 200, true).replace('?', '?lock=');

    deployedContracts.push({
      contract_address: launchpadContractAddress,
      standard_contract_id: launchpadContract.id,
    });

    launchpads.push({
      status: 'draft',
      contract_address: launchpadContractAddress,
      standard_contract_id: launchpadContract.id,
      project_information: {
        // colection_code_id: cw2981Contract.code_id,
        launchpad_fee: msg.launchpad_fee,
        total_supply: 0,
        // launchpad_collector: msg.launchpad_collector,
      },
      collection_information: {
        creator: msg.collection_info.creator,
        uri_prefix: msg.collection_info.uri_prefix,
        uri_suffix: msg.collection_info.uri_suffix,
        max_supply: msg.collection_info.max_supply,
      },
      collection_address: collectionContractAddress,
    });

    collections.push({
      name,
      symbol: msg.collection_info.symbol,
      slug: name.toLowerCase().replaceAll(' ', '_') + '_' + (lastCollectionId + 1),
      contract_address: collectionContractAddress,
      standard_contract_id: cw2981Contract.id,
      description: faker.commerce.productDescription(),
      logo: image,
      feature: image,
      banner: faker.image.abstract(1200, 500, true).replace('?', '?lock='),
      type: 'Art',
      minter_address: launchpadContractAddress,
      owner_address: launchpadContractAddress,
      royalty_percentage: msg.collection_info.royalty_percentage,
      royalty_payment_address: msg.collection_info.royalty_payment_address,
    });
  });

  return Promise.all([
    this.knex('deployed_contracts').insert(deployedContracts).returning('*'),
    this.knex('launchpads').insert(launchpads).returning('*'),
    this.knex('collections').insert(collections).returning('*'),
  ]);
}

async function addMintPhasesToLaunchpads(instantiatorAddress, launchpads) {
  // Blockchain: add mint phases
  const allMintPhases = [];
  for (let i = 0; i < launchpads.length; i += 1) {
    const mintPhasesPerLaunchpad = [];
    const addMintPhasesMsgs = [];
    for (let j = 0; j < NO_MINT_PHASES; j += 1) {
      const startTime = dayjs().add(15 + 6000 * j, 'second');
      const endTime = dayjs().add(6000 + 6000 * j, 'second');
      const msg = {
        add_mint_phase: {
          phase_data: {
            start_time: startTime + '000000',
            end_time: endTime + '000000',
            max_supply: 2000,
            max_nfts_per_address: 20,
            price: {
              amount: '500',
              denom: chainConfig.denom,
            },
            is_public: false,
          },
        },
      };
      addMintPhasesMsgs.push({
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: instantiatorAddress,
          contract: launchpads[i].contract_address,
          msg: toUtf8(JSON.stringify(msg)),
        },
      });

      mintPhasesPerLaunchpad.push({
        name: faker.commerce.productName(),
        type: 'Art',
        starts_at: startTime,
        ends_at: endTime,
        config: {
          // phase_id will be updated later
          ...msg.add_mint_phase.phase_data,
          total_supply: 0,
        },
        launchpad_id: launchpads[i].id,
      });
    }
    // TODO optimize
    // eslint-disable-next-line no-await-in-loop
    const response = await this.client.signAndBroadcast(instantiatorAddress, addMintPhasesMsgs, 'auto');

    for (let i = 1; i <= mintPhasesPerLaunchpad.length; i += 1) {
      mintPhasesPerLaunchpad[i - 1].phase_id = i;
      mintPhasesPerLaunchpad[i - 1].config.phase_id = i;
    }

    // TODO: get phase id by query contract
    // DB update phase_id then insert mint_phases
    // logs.parseRawLog(response.rawLog).forEach((parsedLog) => {
    //   const index = parsedLog.msg_index; // TODO check if msg_index is the same as index of messages array
    //   const phaseId = logs.findAttribute([parsedLog], 'wasm', 'phase_id').value;
    //   mintPhasesPerLaunchpad[index].phase_id = phaseId;
    //   mintPhasesPerLaunchpad[index].config.phase_id = parseInt(phaseId, 10);
    // });
    allMintPhases.push(...mintPhasesPerLaunchpad);
  }
  // console.log('Insert mint phases', allMintPhases);

  return this.knex('mint_phases').insert(allMintPhases).returning('*');
}

exports.seed = async (knex) => {
  // Deletes ALL existing entries
  await knex.raw('TRUNCATE TABLE launchpads CASCADE');

  const { client, wallet } = await setupBlockchainClient(chainConfig);
  const instantiatorAddress = (await wallet.getAccounts())[0].address;

  const [_, launchpads] = await instantiateLaunchpad.bind({ knex, client })(instantiatorAddress);
  await addMintPhasesToLaunchpads.bind({ knex, client })(instantiatorAddress, launchpads);
  // TODO whitelist
  // TODO active
};
