const { onUpdateTrigger, dropOnUpdateTrigger } = require('../knexfile');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('mint_phases', (table) => {
    table.increments();
    table.string('name');
    table.string('type');
    table.timestamp('starts_at').index();
    table.timestamp('ends_at').index();
    table.jsonb('config');

    table.integer('launchpad_id').unsigned().notNullable();
    table.foreign('launchpad_id').references('launchpads.id');

    table.timestamps(true, true);
  }).then(() => {
    knex.raw(onUpdateTrigger('mint_phases'));
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return Promise.all([
    knex.schema.dropTable('mint_phases'),
    knex.raw(dropOnUpdateTrigger('mint_phases')),
  ])
};
