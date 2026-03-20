/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('stores', (table) => {
    table.dropForeign('owner_id');
    table.dropColumn('owner_id');

    table.string('owner_address').after('id');
    table.index('owner_address');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('stores', (table) => {
    table.dropColumn('owner_address');

    table.integer('owner_id').after('id').unsigned().references('id').inTable('users');
  });
};
