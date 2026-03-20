const { onUpdateTrigger, dropOnUpdateTrigger } = require('../knexfile');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('custom_banners', (table) => {
      table.increments();
      table.string('media_url').notNullable();
      table.timestamps(true, true);
    })
    .then(() => {
      knex.raw(onUpdateTrigger('custom_banners'));
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return Promise.all([knex.schema.dropTable('custom_banners'), knex.raw(dropOnUpdateTrigger('custom_banners'))]);
};
