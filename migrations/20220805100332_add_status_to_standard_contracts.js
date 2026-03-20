/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('standard_contracts', (table) => {
    table.enum('status', ['active', 'retired']).defaultTo('active');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('standard_contracts', (table) => {
    table.dropColumn('status');
  });
};
