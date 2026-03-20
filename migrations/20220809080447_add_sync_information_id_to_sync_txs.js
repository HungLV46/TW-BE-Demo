/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('sync_txs', (table) => {
    table.dropColumns(['key', 'value']);
    table.integer('sync_information_id').unsigned();
    table.foreign('sync_information_id').references('sync_informations.id').onDelete('SET NULL');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('sync_txs', (table) => {
    table.dropForeign('sync_information_id');
    table.dropColumn('sync_information_id');
    table.string('key').index().notNullable();
    table.string('value').index().notNullable();
  });
};
