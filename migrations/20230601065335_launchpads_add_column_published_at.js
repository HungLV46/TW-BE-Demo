/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('launchpads', (table) => {
    table.timestamp('published_at').nullable();
    table.dropColumn('published');
  });
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('launchpads', (table) => {
    table.dropColumn('published_at');
    table.boolean('published').defaultTo(false);
  });
};
