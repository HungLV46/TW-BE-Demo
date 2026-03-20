/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('custom_banners', (table) => {
    table.string('primary_button_link');
    table.boolean('primary_button_new_tab').defaultTo(true);
    table.string('secondary_button_link').nullable();
    table.boolean('secondary_button_new_tab').defaultTo(true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('custom_banners', (table) => {
    table.dropColumn('primary_button_link');
    table.dropColumn('primary_button_new_tab');
    table.dropColumn('secondary_button_link');
    table.dropColumn('secondary_button_new_tab');
  });
};
