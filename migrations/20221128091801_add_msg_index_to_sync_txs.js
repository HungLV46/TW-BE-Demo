/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('sync_txs', (table) => {
    table.string('msg_index').nullable();
    table.dropIndex('height');
    table.index(['height', 'msg_index']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('sync_txs', (table) => {
    table.dropIndex(['height', 'msg_index']);
    table.dropColumn('msg_index');
    table.index('height');
  });
};
