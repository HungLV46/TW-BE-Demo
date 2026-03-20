/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.integer('sync_tx_id').unsigned();
    table.foreign('sync_tx_id').references('sync_txs.id').onDelete('SET NULL');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropColumn('sync_tx_id');
  });
};
