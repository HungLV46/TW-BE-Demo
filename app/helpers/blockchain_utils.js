const { SigningCosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const { GasPrice } = require('@cosmjs/stargate');
const { makeCosmoshubPath } = require('@cosmjs/amino');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const _ = require('lodash');

async function setupBlockchainClient(chainConfig, nUsers = 0) {
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

async function instantiateContract(codeId, wallet, msg, chainConfig, options = {}) {
  // instantiate new contract
  const clientOptions = {
    broadcastTimeoutMs: chainConfig.broadcastTimeoutMs,
    broadcastPollIntervalMs: chainConfig.broadcastPollIntervalMs,
    gasPrice: GasPrice.fromString(`0.025${chainConfig.denom}`),
  };
  const client = await SigningCosmWasmClient.connectWithSigner(chainConfig.rpcEndpoint, wallet, clientOptions);
  const account = (await wallet.getAccounts())[0];

  const response = await client.instantiate(
    account.address,
    parseInt(codeId, 10),
    msg,
    `${codeId} instance`,
    'auto',
    options,
  );
  return response;
}

// helper function to interact with blockchain contract
async function executeContract(contractAddress, wallet, msg, chainConfig, funds) {
  // initialize client
  const clientOptions = {
    broadcastTimeoutMs: chainConfig.broadcastTimeoutMs,
    broadcastPollIntervalMs: chainConfig.broadcastPollIntervalMs,
    gasPrice: GasPrice.fromString(`0.025${chainConfig.denom}`),
  };
  const client = await SigningCosmWasmClient.connectWithSigner(chainConfig.rpcEndpoint, wallet, clientOptions);
  const account = (await wallet.getAccounts())[0];

  // execute contract
  const response = await client.execute(account.address, contractAddress, msg, 'auto', '', funds);

  return response;
}

async function queryContract(contractAddress, wallet, queryMsg, chainConfig) {
  // initialize client
  const clientOptions = {
    broadcastTimeoutMs: chainConfig.broadcastTimeoutMs,
    broadcastPollIntervalMs: chainConfig.broadcastPollIntervalMs,
    gasPrice: GasPrice.fromString(`0.025${chainConfig.denom}`),
  };
  const client = await SigningCosmWasmClient.connectWithSigner(chainConfig.rpcEndpoint, wallet, clientOptions);

  // query contract
  const response = await client.queryContractSmart(contractAddress, queryMsg);

  return response;
}

function getEventAttributeValue(events, eventType, attributeKey, attributeValuePredicate, indexIncreasement = 0) {
  const event = events.find((e) => e.type === eventType);

  if (_.isEmpty(event) || _.isEmpty(event.attributes)) return null;

  const attributeIndex = event.attributes.findIndex((attribute) => {
    return attribute.key === attributeKey && attributeValuePredicate(attribute.value);
  });

  if (attributeIndex < 0) return null;

  return event.attributes[attributeIndex + indexIncreasement].value;
}

/**
 * Find Attribute value which statisfies certain conditions in the first log
 *
 * @returns
 */
function findAttributeValueFromEvents(events, eventType, attrKey, valuePredicate = () => true) {
  try {
    let targetEventIndex = -1;
    let targetAttributeIndex = -1;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type === eventType) {
        targetEventIndex = i;
        targetAttributeIndex = event.attributes.findIndex((attr) => attr.key === attrKey);
        if (targetAttributeIndex !== -1 && valuePredicate(event.attributes[targetAttributeIndex].value)) {
          break;
        }
      }
    }

    return {
      value: events[targetEventIndex].attributes[targetAttributeIndex].value,
      event_index: targetEventIndex,
      attribute_index: targetAttributeIndex,
    };
  } catch {
    return { value: undefined, event_index: -1, attribute_index: -1 };
  }
}

/**
 * Find Attribute value which statisfies certain conditions in the first log
 *
 * @returns
 */
function findAllAttributeValueFromEvents(events, eventType, attrKey, valuePredicate = () => true) {
  try {
    let targetEventIndex = -1;
    let targetAttributeIndex = -1;
    const findResults = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type === eventType) {
        targetEventIndex = i;
        targetAttributeIndex = event.attributes.findIndex((attr) => attr.key === attrKey);
        if (targetAttributeIndex !== -1 && valuePredicate(event.attributes[targetAttributeIndex].value)) {
          findResults.push({
            value: events[targetEventIndex].attributes[targetAttributeIndex].value,
            event_index: targetEventIndex,
            attribute_index: targetAttributeIndex,
          });
        }
      }
    }

    return findResults;
  } catch {
    return [];
  }
}

module.exports = {
  instantiateContract,
  executeContract,
  queryContract,
  setupBlockchainClient,
  getEventAttributeValue,
  findAttributeValueFromEvents,
  findAllAttributeValueFromEvents,
};
