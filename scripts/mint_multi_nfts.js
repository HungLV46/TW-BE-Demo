const chainConfig = require('../config/chain').serenity;

const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningCosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const { calculateFee, GasPrice } = require('@cosmjs/stargate');
const { toUtf8 } = require('@cosmjs/encoding');
const { faker } = require('@faker-js/faker');
const { instantiateContract } = require('../app/helpers/blockchain_utils');

const cliProgress = require('cli-progress');

const NO_NFTS = process.env.NO_NFTS || 1;
const NO_COLLECTIONS = process.env.NO_COLLECTIONS || 1;

async function mint() {
  const mnemonic = '';
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: chainConfig.prefix });
  const account = (await wallet.getAccounts())[0];
  console.log('Account:', await wallet.getAccounts());
  const gasPrice = GasPrice.fromString(`0.025${chainConfig.denom}`);
  const client = await SigningCosmWasmClient.connectWithSigner(chainConfig.rpcEndpoint, wallet, {
    gasPrice,
    broadcastTimeoutMs: 10000,
    broadcastPollIntervalMs: 500,
  });

  // const cw2981CodeId = 189;
  const cw2981CodeId = 505;
  const collections = [];
  for (let i = 1; i <= NO_COLLECTIONS; i += 1) {
    const ownerAddress = account.address;
    const name = faker.commerce.productName();
    const symbol = name
      .replace(/[aeiou\s]/gi, '')
      .slice(0, 5)
      .toUpperCase();
    const msg = {
      name,
      symbol,
      minter: ownerAddress,
    };
    // eslint-disable-next-line no-await-in-loop
    const response = await instantiateContract(cw2981CodeId, wallet, msg, chainConfig);
    collections.push({
      name,
      symbol,
      contract_address: response.contractAddress,
      minter_address: ownerAddress,
      owner_address: ownerAddress,
    });
  }

  // eslint-disable-next-line no-console
  console.log('Minting NFTs...');
  const loopCount = NO_NFTS;
  const pbar = new cliProgress.SingleBar(
    {
      format: '{bar} {percentage}% | ETA: {eta}s | {value}/{total}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    },
    cliProgress.Presets.shades_grey,
  );

  const nfts = [];
  pbar.start(loopCount * 1, 0);
  // eslint-disable-next-line no-await-in-loop
  // const nfts = await Promise.all(Object.values(usersByAddress).map(async (owner) => {
  // const nfts = [];
  // eslint-disable-next-line
  for (let i = 1; i <= 100; i += 1) {
    const collection = collections[Math.floor(Math.random() * collections.length)];
    const msgs = [];
    for (let i = 0; i < loopCount; i += 1) {
      const name = faker.commerce.productName();
      // prepare msg
      const tokenId = faker.datatype.hexadecimal(32);
      const metadata = {
        image: `https://loremflickr.com/500/500/${name.split(' ').slice(-1)[0]}?lock=${faker.mersenne.rand(
          10000,
          1000,
        )}`,
        external_url: faker.internet.url(),
        description: faker.commerce.productDescription(),
        name,
        attributes: Array.from(Array(faker.mersenne.rand(10, 4)), () => {
          return {
            trait_type: faker.word.noun(),
            value: faker.word.adjective(),
          };
        }),
        background_color: faker.datatype.hexadecimal(6).slice(2),
      };

      const mintMsg = {
        mint: {
          owner: account.address,
          token_id: tokenId,
          extension: metadata,
        },
      };

      msgs.push({
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: {
          sender: account.address,
          contract: collection.contract_address,
          msg: toUtf8(JSON.stringify(mintMsg)),
        },
      });

      nfts.push({
        name,
        token_id: tokenId,
        owner_address: account.address,
        contract_address: collection.contract_address,
        metadata,
      });
    }

    const gasPrice = GasPrice.fromString(`0.025${chainConfig.denom}`);
    const mintFee = calculateFee(14000000, gasPrice);
    // eslint-disable-next-line no-await-in-loop
    const response = await client.signAndBroadcast(account.address, msgs, mintFee);
    // log error if response code is not 0
    if (response.code) {
      // eslint-disable-next-line no-console
      console.log(response);
    }
    pbar.increment(loopCount);
  }
}

mint();
