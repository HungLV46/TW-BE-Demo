const { ServiceBroker } = require('moleculer');

const LaunchpadServiceSchema = require('@services/launchpad.service');
const SyncBlockServiceSchema = require('@services/sync_block.service');
const {
  StandardContract,
  DeployedContract,
  Launchpad,
  MintPhase,
  Collection,
  CollectionVerification,
} = require('@models');
const knex = require('@config/database');
const { coins } = require('@cosmjs/proto-signing');
const { MintPhaseFactory } = require('../factories/mint_phase_factory');
const WhitelistFactory = require('../factories/whitelist_factory');
const { createLaunchpadData, LaunchPadFactory } = require('../factories/launchpad');
const { sleep, setupBlockchainClient } = require('../helpers/test-utility');
const dayjs = require('dayjs');
const { findAllAttributeValueFromEvents } = require('@helpers/blockchain_utils');

describe('Test launchpad', () => {
  let broker = new ServiceBroker({ logger: false });
  broker.createService(LaunchpadServiceSchema);
  broker.createService(SyncBlockServiceSchema);
  let setup;
  let client;
  let adminAddress;

  beforeAll(async () => {
    process.env.NO_USERS = 4;
    process.env.NO_LAUNCHPADS = 1;
    process.env.NO_MINT_PHASES = 2;

    await knex.seed.run({ specific: '02_users.js' });
    await knex.seed.run({ specific: '11_launchpads.js' });
    setup = await setupBlockchainClient(process.env.NO_USERS);
    client = setup.client;
    adminAddress = (await setup.wallet.getAccounts())[0].address;

    await broker.start();
  }, 100000);
  afterAll(async () => {
    await broker.stop();
  });

  describe('Test import launchpad', () => {
    test('Import success, overwrite = false', async () => {
      // setup.
      const launchpadBeforeImport = await Launchpad.query().first();
      const mintPhasesBeforeImport = await MintPhase.query()
        .where({ launchpad_id: launchpadBeforeImport.id })
        .orderBy('id');

      // execute.
      await broker.call('launchpad.import', {
        launchpad_id: launchpadBeforeImport.id,
        contract_address: launchpadBeforeImport.contract_address,
        overwrite: false,
      });

      // verify.
      const launchpadAfterImport = await launchpadBeforeImport.$query().first();
      expect(launchpadAfterImport).toMatchObject(launchpadBeforeImport);

      const mintPhasesAfterImport = await MintPhase.query()
        .where({ launchpad_id: launchpadBeforeImport.id })
        .orderBy('id');
      expect(mintPhasesAfterImport).toMatchObject(mintPhasesBeforeImport);
    }, 100000);

    test('Import success, overwrite = true, update launchpad', async () => {
      // setup.
      let launchpad = await Launchpad.query().first();
      launchpad.status = 'deployed';
      await Launchpad.query()
        .findById(launchpad.id)
        .update({
          collection_address: 'new collection address',
          status: 'new status',
          project_information: {
            launchpad_fee: 9999,
            total_supply: 9,
          },
          collection_information: {
            creator: 'new creator address',
            uri_prefix: 'new uri_prefix',
            uri_suffix: 'new uri_suffix',
            max_supply: 999,
          },
        })
        .returning('*');

      // execute.
      await broker.call('launchpad.import', {
        launchpad_id: launchpad.id,
        contract_address: launchpad.contract_address,
        overwrite: true,
      });

      // verify.
      const launchpadAfterImport = await launchpad.$query().first();
      expect(launchpadAfterImport.updated_at).not.toBe(launchpad.updated_at);
      delete launchpadAfterImport.updated_at;
      delete launchpad.updated_at;
      expect(launchpadAfterImport).toMatchObject(launchpad);
    }, 100000);

    test('Import success, overwrite = true, update mint phases', async () => {
      // setup.
      const launchpadBeforeImport = await Launchpad.query().first();
      const mintPhases = await MintPhase.query().where({ launchpad_id: launchpadBeforeImport.id });
      await MintPhase.query()
        .where({ launchpad_id: launchpadBeforeImport.id })
        .update({
          phase_id: 999,
          starts_at: dayjs(),
          ends_at: dayjs(),
          config: {
            phase_id: 999,
            start_time: new Date(),
            end_time: new Date(),
            max_supply: dayjs().unix(),
            total_supply: dayjs().unix(),
            max_nfts_per_address: 999,
            price: {},
            is_public: true,
          },
        });

      // execute.
      await broker.call('launchpad.import', {
        launchpad_id: launchpadBeforeImport.id,
        contract_address: launchpadBeforeImport.contract_address,
        overwrite: true,
      });

      // verify.
      const launchpadAfterImport = await launchpadBeforeImport.$query().first();
      expect(launchpadAfterImport).toMatchObject(launchpadBeforeImport);

      // mintphase 0 unchanged
      const mintPhases0AfterImport = await mintPhases[0].$query().first();
      expect(mintPhases0AfterImport.updated_at).not.toBe(mintPhases[0].updated_at);
      delete mintPhases0AfterImport.updated_at;
      delete mintPhases[0].updated_at;
      expect(mintPhases0AfterImport).toMatchObject(mintPhases[0]);

      // mintphase 1 unchanged
      const mintPhases1AfterImport = await mintPhases[1].$query().first();
      expect(mintPhases1AfterImport.updated_at).not.toBe(mintPhases[1].updated_at);
      delete mintPhases1AfterImport.updated_at;
      delete mintPhases[1].updated_at;
      expect(mintPhases1AfterImport).toMatchObject(mintPhases[1]);
    }, 100000);
  });

  describe('Test deploy launchpad', () => {
    it('Deploy success', async () => {
      // setup.
      const launchpad = await Launchpad.query().insert(await createLaunchpadData());

      // execute.
      await broker.call('launchpad.deploy', { launchpad_id: launchpad.id });

      // verify.
      const deployedLaunchpad = await launchpad.$query().first();
      const collectionAddress = deployedLaunchpad.collection_address;
      const deployedCollection = await Collection.query().where({ contract_address: collectionAddress }).first();
      const cw2981 = await StandardContract.getActive(StandardContract.TYPES.CW2981);
      expect(deployedCollection).toMatchObject({
        name: launchpad.collection_information.name,
        symbol: launchpad.collection_information.symbol,
        contract_address: collectionAddress,
        standard_contract_id: cw2981.id,
        description: launchpad.collection_information.description,
        logo: launchpad.collection_information.logo,
        feature: launchpad.collection_information.feature,
        banner: launchpad.collection_information.banner,
        minter_address: deployedLaunchpad.contract_address,
        owner_address: launchpad.collection_information.creator,
        metadata: null,
        slug: deployedCollection.generateSlug(launchpad.collection_information.name),
        type: launchpad.collection_information.category,
        website: launchpad.collection_information.website,
        royalty_percentage: launchpad.collection_information.royalty_percentage,
        royalty_payment_address: launchpad.collection_information.royalty_payment_address,
        verified_at: expect.any(Date),
      });

      const discord = await CollectionVerification.query()
        .where({ contract_address: collectionAddress, type: CollectionVerification.TYPES.DISCORD })
        .first();
      expect(discord.invite_link).toBe(launchpad.collection_information.discord);

      const twitter = await CollectionVerification.query()
        .where({ contract_address: collectionAddress, type: CollectionVerification.TYPES.TWITTER })
        .first();
      expect(twitter.additional_info).toMatchObject({ profile_link: launchpad.collection_information.twitter });

      const telegram = await CollectionVerification.query()
        .where({ contract_address: collectionAddress, type: CollectionVerification.TYPES.TELEGRAM })
        .first();
      expect(telegram.invite_link).toBe(launchpad.collection_information.telegram);

      const collectionDeployedContract = await DeployedContract.query()
        .where({ contract_address: collectionAddress })
        .first();
      expect(collectionDeployedContract).toMatchObject({
        contract_address: collectionAddress,
        standard_contract_id: cw2981.id,
      });

      expect(deployedLaunchpad).toMatchObject({
        ...launchpad,
        status: Launchpad.STATUSES.DEPLOYED,
        contract_address: expect.any(String),
        collection_address: expect.any(String),
        slug: deployedCollection.slug,
      });
    }, 100000);

    it('Re-deploy success', async () => {
      // setup.
      const launchpad = await Launchpad.query().insert(await createLaunchpadData());

      await broker.call('launchpad.deploy', { launchpad_id: launchpad.id });
      const deployedLaunchpad1 = await launchpad.$query().first();

      // execute.
      await broker.call('launchpad.deploy', { launchpad_id: launchpad.id });

      // verify.
      const deployedLaunchpad2 = await launchpad.$query().first();
      expect(deployedLaunchpad1.contract_address).not.toBe(deployedLaunchpad2.contract_address);
      expect(deployedLaunchpad1.collection_address).not.toBe(deployedLaunchpad2.collection_address);
    }, 100000);
  });

  describe('Test add mint phases and whitelists', () => {
    it('Mint phases and whitelists added success', async () => {
      const launchpad = await Launchpad.query().insert(await createLaunchpadData());
      const deployedLaunchpad = await broker.call('launchpad.deploy', { launchpad_id: launchpad.id });
      const whitelists = [
        WhitelistFactory.build(),
        WhitelistFactory.build({ aura_address: 'auravaloper14tfxwudnv9h8uer4674tfmx53gvs5t092nke8q' }),
      ];
      const fakeMintPhases = [
        MintPhaseFactory.build(
          {
            launchpad_id: launchpad.id,
            whitelists: whitelists,
          },
          { transient: { isPublic: false } },
        ),
        MintPhaseFactory.build({ launchpad_id: launchpad.id }, { transient: { isPublic: false } }),
      ];
      const mintPhases = await MintPhase.query().insertGraph(fakeMintPhases);
      expect(mintPhases.length).toBe(2);
      await broker.call('launchpad.add_mint_phases_and_whitelists', { launchpad_id: launchpad.id });
      const mintPhaseQueryMessage = { get_all_phase_configs: {} };
      const deployedMintPhases = await client.queryContractSmart(
        deployedLaunchpad.contractAddress,
        mintPhaseQueryMessage,
      );
      const mintPhasesInDB = await MintPhase.query().where({ launchpad_id: launchpad.id }).orderBy('id');
      await sleep(3000);

      // check mint phases updated
      expect(mintPhasesInDB.length).toBe(deployedMintPhases.length);
      expect(mintPhasesInDB[0].phase_id).toBe(deployedMintPhases[0].phase_id);
      expect(mintPhasesInDB[0].config.start_time).toBe(deployedMintPhases[0].start_time);
      expect(mintPhasesInDB[1].phase_id).toBe(deployedMintPhases[1].phase_id);
      expect(mintPhasesInDB[1].config.start_time).toBe(deployedMintPhases[1].start_time);

      // check whitelist addresses
      let checkWhitelistAddressMsg = { mintable: { user: whitelists[0].aura_address } };
      let mintInfo = await client.queryContractSmart(deployedLaunchpad.contractAddress, checkWhitelistAddressMsg);
      expect(mintInfo[0].phase_id).toBe(1);
      expect(mintInfo[0].remaining_nfts).toBe(10);

      // non whitelist addresss => should return remaining nft to be 0
      checkWhitelistAddressMsg = { mintable: { user: 'aura1v52kz96vjcjzq90jjkwxreqrrve65mx2csd6j0' } };
      mintInfo = await client.queryContractSmart(deployedLaunchpad.contractAddress, checkWhitelistAddressMsg);
      expect(mintInfo[0].phase_id).toBe(1);
      expect(mintInfo[0].remaining_nfts).toBe(0);
    }, 100000);
  });

  describe('Test launchpad mint nft', () => {
    beforeEach(async () => {
      await knex('whitelists').del();
      await knex('mint_phases').del();
      await knex('collections').del();
      await knex('launchpads').del();
      MintPhaseFactory.rewindSequence();
    });

    it('Reach collection max supply then mint fail', async () => {
      // deploy launch pad, with max supply = 2
      const launchpadStdContract = await StandardContract.getActive(StandardContract.TYPES.LAUNCHPAD);
      const fakeLaunchPad = LaunchPadFactory.build({
        standard_contract_id: launchpadStdContract.id,
        collection_information: {
          max_supply: 2,
        },
      });
      const launchPad = await Launchpad.query().insert(fakeLaunchPad);
      const deployedLaunchpad = await broker.call('launchpad.deploy', { launchpad_id: launchPad.id });
      const fakeMintPhase = MintPhaseFactory.build({ launchpad_id: launchPad.id }, { transient: { totalSupply: 2 } });
      // deploy mint phase
      const insertedMintPhase = await MintPhase.query().insert(fakeMintPhase).returning('*');
      await broker.call('launchpad.add_mint_phases_and_whitelists', { launchpad_id: launchPad.id });
      const mintPhaseQueryMessage = { get_all_phase_configs: {} };
      const deployedMintPhase = await client.queryContractSmart(
        deployedLaunchpad.contractAddress,
        mintPhaseQueryMessage,
      );

      // activate launch pad
      const activeLaunchpadMessage = { activate_launchpad: {} };
      await client.execute(adminAddress, deployedLaunchpad.contractAddress, activeLaunchpadMessage, 'auto');
      await sleep(3000);

      // mint 3 nft => fail
      let mintNftMessage = {
        mint: {
          phase_id: deployedMintPhase[0].phase_id,
          amount: 3,
        },
      };
      const funds = coins(Number(insertedMintPhase.config.price.amount), 'uaura');
      expect(
        client.execute(
          adminAddress,
          deployedLaunchpad.contractAddress,
          mintNftMessage,
          'auto',
          'mint a launchpad',
          funds,
        ),
      ).rejects.toThrow(/(Max supply reached)/);
    }, 100000);

    it('When setup token id offset, nft token id should range between', async () => {
      const launchpadStdContract = await StandardContract.getActive(StandardContract.TYPES.LAUNCHPAD);
      const tokenIdOffset = 113;
      const fakeLaunchPad = LaunchPadFactory.build({
        standard_contract_id: launchpadStdContract.id,
        collection_information: {
          token_id_offset: tokenIdOffset,
        },
      });
      const launchPad = await Launchpad.query().insert(fakeLaunchPad).returning('*');
      const deployedLaunchPad = await broker.call('launchpad.deploy', { launchpad_id: launchPad.id });
      await Launchpad.query().where({ contract_address: deployedLaunchPad.contractAddress }).first();

      // deploy mint phase
      const fakeMintPhase = MintPhaseFactory.build({ launchpad_id: launchPad.id });
      const insertedMintPhase = await MintPhase.query().insert(fakeMintPhase).returning('*');
      await broker.call('launchpad.add_mint_phases_and_whitelists', { launchpad_id: launchPad.id });
      const mintPhaseQueryMessage = { get_all_phase_configs: {} };
      const deployedMintPhase = await client.queryContractSmart(
        deployedLaunchPad.contractAddress,
        mintPhaseQueryMessage,
      );

      // activate launch pad
      const activeLaunchpadMessage = { activate_launchpad: {} };
      await client.execute(adminAddress, deployedLaunchPad.contractAddress, activeLaunchpadMessage, 'auto');
      await sleep(3000);

      let mintNftMessage = {
        mint: {
          phase_id: deployedMintPhase[0].phase_id,
          amount: 10,
        },
      };
      const funds = coins(Number(insertedMintPhase.config.price.amount) * mintNftMessage.mint.amount, 'uaura');
      let mintResponse = await client.execute(
        adminAddress,
        deployedLaunchPad.contractAddress,
        mintNftMessage,
        'auto',
        'mint a launchpad',
        funds,
      );

      let tokenFindResults = findAllAttributeValueFromEvents(mintResponse.logs[0].events, 'wasm', 'token_id');
      expect(tokenFindResults.length).toBe(mintNftMessage.mint.amount);
      tokenFindResults.map((findResults) => {
        expect(
          findResults.value > tokenIdOffset
            && findResults.value <= tokenIdOffset + launchPad.collection_information.max_supply,
        ).toBe(true);
      });
    }, 100000);

    it('When setup reserve tokens, mint should exclude these tokens', async () => {
      const launchpadStdContract = await StandardContract.getActive(StandardContract.TYPES.LAUNCHPAD);
      const reservedTokens = [1, 2, 3, 4, 5, 7, 10];
      const fakeLaunchPad = LaunchPadFactory.build({
        standard_contract_id: launchpadStdContract.id,
        collection_information: {
          reserved_tokens: reservedTokens,
          max_supply: 3, // on-chain token id range 1 => 3+7
        },
      });
      const launchPad = await Launchpad.query().insert(fakeLaunchPad);
      const deployedLaunchPad = await broker.call('launchpad.deploy', { launchpad_id: launchPad.id });

      // deploy mint phase
      const fakeMintPhase = MintPhaseFactory.build({ launchpad_id: launchPad.id });
      const insertedMintPhase = await MintPhase.query().insert(fakeMintPhase).returning('*');
      await broker.call('launchpad.add_mint_phases_and_whitelists', { launchpad_id: launchPad.id });
      const mintPhaseQueryMessage = { get_all_phase_configs: {} };
      const deployedMintPhase = await client.queryContractSmart(
        deployedLaunchPad.contractAddress,
        mintPhaseQueryMessage,
      );

      // activate launch pad
      const activeLaunchpadMessage = { activate_launchpad: {} };
      await client.execute(adminAddress, deployedLaunchPad.contractAddress, activeLaunchpadMessage, 'auto');
      await sleep(3000);

      let mintNftMessage = {
        mint: {
          phase_id: deployedMintPhase[0].phase_id,
          amount: 3,
        },
      };
      const funds = coins(Number(insertedMintPhase.config.price.amount) * mintNftMessage.mint.amount, 'uaura');
      let mintResponse = await client.execute(
        adminAddress,
        deployedLaunchPad.contractAddress,
        mintNftMessage,
        'auto',
        'mint a launchpad',
        funds,
      );

      let tokenFindResults = findAllAttributeValueFromEvents(mintResponse.logs[0].events, 'wasm', 'token_id');
      expect(tokenFindResults.length).toBe(mintNftMessage.mint.amount);
      tokenFindResults.map((tokenFindResult) =>
        expect(reservedTokens.includes(tokenFindResult.value)).toBe(false));
    }, 100000);

    it('When mint exceeding max_nfts_per_address, should fail', async () => {
      const launchpadStdContract = await StandardContract.getActive(StandardContract.TYPES.LAUNCHPAD);
      const fakeLaunchPad = LaunchPadFactory.build({ standard_contract_id: launchpadStdContract.id });
      const launchPad = await Launchpad.query().insert(fakeLaunchPad);
      const deployedLaunchPad = await broker.call('launchpad.deploy', { launchpad_id: launchPad.id });

      // deploy mint phase
      const fakeMintPhase = MintPhaseFactory.build(
        { launchpad_id: launchPad.id },
        { transient: { maxNftsPerAddress: 2 } },
      );
      // fakeMintPhase.config = `{"price": {"denom": "uaura", "amount": "5"}, "end_time": "${
      //   dayjs().add(6000 + 6000, 'second') + '000000'
      // }", "is_public": true, "max_supply": 10, "start_time": "${
      //   dayjs().add(3, 'second') + '000000'
      // }", "total_supply": 10, "max_nfts_per_address": 2}`;
      const insertedMintPhase = await MintPhase.query().insert(fakeMintPhase).returning('*');
      await broker.call('launchpad.add_mint_phases_and_whitelists', { launchpad_id: launchPad.id });
      const mintPhaseQueryMessage = { get_all_phase_configs: {} };
      const deployedMintPhase = await client.queryContractSmart(
        deployedLaunchPad.contractAddress,
        mintPhaseQueryMessage,
      );

      // activate launch pad
      const activeLaunchpadMessage = { activate_launchpad: {} };
      await client.execute(adminAddress, deployedLaunchPad.contractAddress, activeLaunchpadMessage, 'auto');
      await sleep(3000);

      let mintNftMessage = {
        mint: {
          phase_id: deployedMintPhase[0].phase_id,
          amount: 3,
        },
      };
      const funds = coins(Number(insertedMintPhase.config.price.amount) * mintNftMessage.mint.amount, 'uaura');
      expect(
        client.execute(
          adminAddress,
          deployedLaunchPad.contractAddress,
          mintNftMessage,
          'auto',
          'mint a launchpad',
          funds,
        ),
      ).rejects.toThrow(/(User minted too much nfts)/);
    }, 100000);
  });
});
