/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropForeign('collection_id');
    table.dropColumn('collection_id');

    table.string('contract_address').notNullable().index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropColumn('contract_address');

    table.integer('collection_id').unsigned().notNullable().index();
    table.foreign('collection_id').references('collections.id');
  });
};
