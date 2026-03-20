/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('custom_banner_translations', (table) => {
    table.dropColumn('primary_button_link');
    table.dropColumn('primary_button_new_tab');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('custom_banner_translations', (table) => {
    table.string('primary_button_link');
    table.boolean('primary_button_new_tab').defaultTo(true);
  });
};
