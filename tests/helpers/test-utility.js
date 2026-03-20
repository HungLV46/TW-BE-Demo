const { makeCosmoshubPath } = require('@cosmjs/amino');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningCosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const { GasPrice } = require('@cosmjs/stargate');
const chainConfig = require('../../config/chain').defaultChain;

function sleep(sleepTimeInMillisec) {
  return new Promise((resolve) =>
    setTimeout(resolve, sleepTimeInMillisec));
}

// On error, retry several times.
async function retry(fn, maxTries = 1, waitBeforeEachTryInMillisec) {
  try {
    if (waitBeforeEachTryInMillisec) {
      await sleep(waitBeforeEachTryInMillisec);
    }
    await fn();
  } catch (error) {
    if (maxTries > 1) {
      await retry(fn, maxTries - 1);
      return;
    }
    throw error;
  }
}

async function setupBlockchainClient(nUsers = 10) {
  const hdPaths = [];
  for (let i = 0; i <= nUsers; i += 1) {
    hdPaths.push(makeCosmoshubPath(i));
  }
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(chainConfig.mnemonic, {
    prefix: chainConfig.prefix,
    hdPaths,
  });

  const gasPrice = GasPrice.fromString(`0.025${chainConfig.denom}`);
  const client = await SigningCosmWasmClient.connectWithSigner(chainConfig.rpcEndpoint, wallet, {
    gasPrice,
    broadcastTimeoutMs: 10000,
    broadcastPollIntervalMs: 500,
  });

  return { client, wallet };
}

// round half up
function getRoundedDateForTesting(time) {
  return new Date(time.slice(0, 23) + 'Z');
}

async function createWallet(userId) {
  const hdPaths = [makeCosmoshubPath(userId)];
  return DirectSecp256k1HdWallet.fromMnemonic(chainConfig.mnemonic, { prefix: chainConfig.prefix, hdPaths });
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}
const userAddresses = [
  'aura1lr4cheux0pekkrn54954fud0c5qq9fj85lxp9h',
  'aura1qafc5ksrl42s9m26r583x4lksc54mwxc6m0zwx',
  'aura185c8raq9rgfzmy89kwukvpqqhwjvhenzc96tc4',
  'aura136yh8gz8lll97yxvw3ytnjmz6258cuwhqrkr6x',
  'aura192kc8dgsv07jj4r6hln6jcp9f66wjh7cwere57',
  'aura10chln0w4jpwryewezdncqfhvps6v32xw0jjdx4',
  'aura1h4eqpth8np4kvdvs4hh904u3lp7erz8rzxqe8f',
  'aura1u6c9jkn5msar0kcju2tj0sewspjrjemx6dl7t7',
  'aura1tnna62y9pe2yaz8tu6492enaleru7ucl4zk62y',
];

function randomAddress() {
  return userAddresses[getRandomInt(0, userAddresses.length - 1)];
}

function getUserAddress(index) {
  if (index < 0 || index >= userAddresses.length) {
    return '';
  }

  return userAddresses[index];
}

const contractAddress = [
  'aura1u7fq6nqdrs7hqxst9q0eu3h6gkm2yjmerudfu89tq07va4kr3jwqmg2qwd',
  'aura1suxn3jk7rs7wmwt65pqvg4vkmtvr8e89gdejmuy3m5sk32fnku9qsy9vjp',
  'aura1fa4sw8t2nkpyfhea9nuhtdzc02jjz29eugueg0udlv6gy2gla5rspm4qa7',
  'aura1tdu4xae2jw39fzy3qcl4hahyjlt7pczm543exdnjxrc9p36pt9zqrnpnrw',
];

function getContractAddress(index) {
  if (index < 0 || index >= contractAddress.length) {
    return '';
  }

  return contractAddress[index];
}

module.exports = {
  sleep,
  retry,
  setupBlockchainClient,
  getRoundedDateForTesting,
  createWallet,
  randomAddress,
  getUserAddress,
  getContractAddress,
};
