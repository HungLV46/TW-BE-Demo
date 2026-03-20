const { SyncTxsFactory } = require('../tests/factories/sync_txs_factory');
const { NftFactory } = require('../tests/factories/nft_factory');

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await Promise.all([knex('nfts').del(), knex('sync_txs').del()]);
  }

  let syncTxs = SyncTxsFactory.build();
  syncTxs = knex('nfts').insert(syncTxs).returning('*');
  const nft = NftFactory.build({ sync_tx_id: syncTxs.id });

  return knex('nfts').insert(nft);
};
