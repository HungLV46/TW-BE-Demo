const chainConfig = require('../config/chain').defaultChain;

const { GasPrice } = require('@cosmjs/stargate');
const { SigningCosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');

async function offer() {
  const mnemonic = chainConfig.mnemonic;
  // create wallet and client
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: chainConfig.prefix });
  const client = await SigningCosmWasmClient.connectWithSigner(
    chainConfig.rpcEndpoint, 
    wallet, {
      gasPrice: GasPrice.fromString(`0.025${chainConfig.denom}`),
      broadcastTimeoutMs: 10000,
      broadcastPollIntervalMs: 500,
    }
  );

  const offerAddress = (await wallet.getAccounts())[0].address;
  const marketPlaceContractAddress = 'aura1axkh6tdmu689qu7dk2nk69jz0gu5rkcqeumlpgwvr6xzl56smffq2vljzg';
  // offer
  const response = await client.execute(offerAddress, marketPlaceContractAddress, {
    offer_nft: {
      nft: {
        contract_address: 'aura1y6hjq8yvqzk6al4yrjl7yjkt87ujvhaq32c0qvt7627sk0j63d2qandtwm',
        token_id: '0xbdA4Ba8751E57f19DEDda51f6af049A5',
      },
      funds_amount: '100',
      end_time: {
        at_time: '2676168640904000000',
      },
    },
  }, 'auto');

  console.log(response);
}

offer();
