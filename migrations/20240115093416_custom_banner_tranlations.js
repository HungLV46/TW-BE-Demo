const { onUpdateTrigger, dropOnUpdateTrigger } = require('../knexfile');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  knex.schema
    .createTable('custom_banner_translations', (table) => {
      table.increments();
      table.integer('custom_banner_id').unsigned();
      table.string('language_id');
      table.string('title');
      table.string('description');
      table.string('primary_button');
      table.string('primary_button_link');
      table.boolean('primary_button_new_tab').defaultTo(true);
      table.timestamps(true, true);

      table.foreign('custom_banner_id').references('custom_banners.id').onDelete('CASCADE');
    })
    .then(() => {
      knex.raw(onUpdateTrigger('custom_banner_translations'));
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return Promise.all([
    knex.schema.dropTable('custom_banner_translations'),
    knex.raw(dropOnUpdateTrigger('custom_banner_translations')),
  ]);
};
