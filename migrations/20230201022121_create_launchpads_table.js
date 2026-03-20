const { onUpdateTrigger, dropOnUpdateTrigger } = require('../knexfile');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('launchpads', (table) => {
    table.increments();
    table.string('name').notNull();
    table.string('status').index();
    table.string('contract_address').index();

    table.integer('standard_contract_id').unsigned().notNullable();
    table.foreign('standard_contract_id').references('standard_contracts.');

    table.jsonb('project_information');

    table.timestamps(true, true);
  }).then(() => {
    knex.raw(onUpdateTrigger('launchpads'));
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return Promise.all([
    knex.schema.dropTable('launchpads'),
    knex.raw(dropOnUpdateTrigger('launchpads')),
  ])
};
