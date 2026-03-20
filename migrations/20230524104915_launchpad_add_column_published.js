/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('launchpads', (table) => {
    table.boolean('published').defaultTo(false);
    table.boolean('synced_on_chain').defaultTo(false);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('launchpads', (table) => {
    table.dropColumn('published');
    table.dropColumn('synced_on_chain');
  });
};
