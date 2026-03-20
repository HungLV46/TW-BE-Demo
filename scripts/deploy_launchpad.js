require('module-alias/register');

const { setupBlockchainClient } = require('../app/helpers/blockchain_utils');
const chainConfig = require('../config/chain').defaultChain;

const _ = require('lodash');
const crypto = require('crypto');

const { toUtf8 } = require('@cosmjs/encoding');
const { logs } = require('@cosmjs/stargate');
const {
  Collection, StandardContract, Launchpad, MintPhase, Whitelist
} = require('../app/models');

async function convertDBRecordToInstantiateLaunchpadMessage(launchpad) {
  const cw2981Contract = await StandardContract.query()
    .where({ name: 'cw2981-royalties', status: 'active' })
    .first();

  const COLLECTION_INFO_ATTRIBUTES = [
    'creator',
    'name',
    'symbol',
    'max_supply',
    'uri_prefix',
    'uri_suffix',
    'royalty_percentage',
    'royalty_payment_address'
  ];

  return {
    random_seed: crypto.randomBytes(32).toString('hex'),
    colection_code_id: parseInt(cw2981Contract.code_id, 10),
    launchpad_fee: 0, // TODO specified by admin
    // launchpad_collector: instantiatorAddress, TODO specified by admin
    collection_info: _.pick(launchpad.collection_information, COLLECTION_INFO_ATTRIBUTES),
  };
}

async function instantiateLaunchpad(instantiatorAddress, instantiateMessage) {
  const launchpadContract = await StandardContract.query()
    .where({ name: 'nft-launchpad', status: 'active' })
    .first();

  return this.client.instantiate(instantiatorAddress, parseInt(launchpadContract.code_id, 10), instantiateMessage, `${launchpadContract.code_id} instance`, 'auto');
}

function convertDBRecordsToAddMintPhaseMessage(mintPhases) {
  const PHASE_DATA_ATTRIBUTES = [
    'start_time',
    'end_time',
    'max_supply',
    'max_nfts_per_address',
    'price',
    'is_public',
  ];

  return mintPhases.map(mintPhase =>
    ({
      add_mint_phase: {
        phase_data: _.pick(mintPhase.config, PHASE_DATA_ATTRIBUTES),
      }
    }));
}

async function execute(instantiatorAddress, contractAddress, messages) {
  if (_.isEmpty(messages)) throw new Error('Empty execution messages');

  const addMessages = messages.map(message =>
    ({
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: {
        sender: instantiatorAddress,
        contract: contractAddress,
        msg: toUtf8(JSON.stringify(message)),
      }
    }));
  return this.client.signAndBroadcast(instantiatorAddress, addMessages, 'auto');
}


async function createCollectionFromLaunchpad(launchpad, collectionContractAddress) {
  const cw2981Contract = await StandardContract.query()
    .where({ name: 'cw2981-royalties', status: 'active' })
    .first();

  const collection = {
    name: launchpad.collection_information.name,
    symbol: launchpad.collection_information.symbol,
    contract_address: collectionContractAddress,
    standard_contract_id: cw2981Contract.id,
    description: launchpad.collection_information.description,
    logo: launchpad.collection_information.logo,
    feature: launchpad.collection_information.feature,
    banner: launchpad.collection_information.banner,
    minter_address: launchpad.contract_address,
    owner_address: launchpad.contract_address,
    // metadata: launchpad.,
    type: launchpad.collection_information.category,
    website: launchpad.collection_information.website,
    royalty_percentage: launchpad.collection_information.royalty_percentage,
    royalty_payment_address: launchpad.collection_information.royalty_payment_address,
    collection_verifications: [
      {
        contract_address: collectionContractAddress,
        type: 'discord',
        invite_link: launchpad.collection_information.discord,
      },
      {
        contract_address: collectionContractAddress,
        type: 'twitter',
        additional_info: {
          profile_link: launchpad.collection_information.twitter,
        },
      },
      {
        contract_address: collectionContractAddress,
        type: 'telegram',
        invite_link: launchpad.collection_information.telegram,
      }
    ]
  };

  const insertedCollcetion = await Collection.query().insertGraph(collection).returning('*');
  await insertedCollcetion.$query().patch({ slug: insertedCollcetion.generateSlug() });
}

function extractPhaseIdInResponseThenUpdateMintPhase(addMintPhaseResponse, mintPhases) {
  const updateMintPhasePromises = logs.parseRawLog(addMintPhaseResponse.rawLog).map((parsedLog) => {
    const index = parsedLog.msg_index; // TODO check if msg_index is the same as index of messages array
    const phaseId = logs.findAttribute([parsedLog], 'wasm', 'phase_id').value;
    const mintPhase = mintPhases[index];

    return MintPhase.query().findById(mintPhase.id).patch({
      phase_id: phaseId,
      config: {
        ...mintPhase.config,
        phase_id: parseInt(phaseId, 10),
      }
    }).returning('*');
  });

  return Promise.all(updateMintPhasePromises);
}

async function convertDBRecordsToAddWhitelistMessage(mintPhases) {
  const whiteLists = await Whitelist.query().whereIn('mint_phase_id', mintPhases.map(mintPhase => { return mintPhase.id; }));
  const whitelistsByMintPhaseId = _.groupBy(whiteLists, 'mint_phase_id');
  return mintPhases.map(mintPhase => {
    return {
      add_whitelist: {
        phase_id: mintPhase.config.phase_id,
        whitelists: (whitelistsByMintPhaseId[mintPhase.id] || []).map(whitelist => { return whitelist.aura_address; })
      }
    };
  }).filter(message => { return !_.isEmpty(message.add_whitelist.whitelists); });
}

async function deploy(launchpadId) {
  if (!launchpadId) throw new Error('ID of launchpad in DB must be specified!');

  const { client, wallet } = await setupBlockchainClient(chainConfig, 50);
  const instantiatorAddress = (await wallet.getAccounts())[0].address;

  // instantiate launchpad
  const launchpad = await Launchpad.query().findById(launchpadId);
  const instantiateMessage = await convertDBRecordToInstantiateLaunchpadMessage(launchpad);
  const instantiateResponse = await instantiateLaunchpad.bind({ client })(instantiatorAddress, instantiateMessage);
  console.log('Instantiate launchpad success with response:'); console.log(instantiateResponse);

  // update DB launchpad & collection
  const launchpadContractAddress = instantiateResponse.contractAddress;
  const collectionContractAddress = logs.findAttribute(instantiateResponse.logs, 'wasm', 'collection_address').value;
  await launchpad.$query().update({ contract_address: launchpadContractAddress, collection_address: collectionContractAddress });
  await createCollectionFromLaunchpad(launchpad, collectionContractAddress);

  // add mint phases & update DB
  let mintPhases = await MintPhase.query().where({ launchpad_id: launchpadId }).orderBy('starts_at');
  // Fake future date
  // for (let i = 0; i < mintPhases.length; i += 1) {
  //   mintPhases[i].config.start_time = (Number(mintPhases[i].config.start_time) + Math.pow(10, 18)).toString();
  //   mintPhases[i].config.end_time = (Number(mintPhases[i].config.end_time) + Math.pow(10, 18)).toString();
  // }
  const addMintPhaseMessages = await convertDBRecordsToAddMintPhaseMessage(mintPhases);
  const addMintPhaseResponse = await execute.bind({ client })(instantiatorAddress, launchpadContractAddress, addMintPhaseMessages);
  mintPhases = await extractPhaseIdInResponseThenUpdateMintPhase(addMintPhaseResponse, mintPhases);
  console.log('\nAdd mint phases success with response:'); console.log(addMintPhaseResponse);

  // add whitelist
  const addWhitelistMessages = await convertDBRecordsToAddWhitelistMessage(mintPhases);
  console.log(JSON.stringify(addWhitelistMessages, null, 2));
  const addWhitelistResponse = await execute.bind({ client })(instantiatorAddress, launchpadContractAddress, addWhitelistMessages);
  console.log('\nAdd whitelist success with response:'); console.log(addWhitelistResponse);

  // active launchpad
  const activeLaunchpadMessage = { activate_launchpad: {} };
  const activeLaunchpadResponse = await client.execute(instantiatorAddress, launchpadContractAddress, activeLaunchpadMessage, 'auto');
  console.log('\nActive launchpad success!'); console.log(activeLaunchpadResponse);

  await launchpad.$query().update({ status: Launchpad.STATUSES.READY_TO_MINT });
}

deploy(process.argv[2]);
