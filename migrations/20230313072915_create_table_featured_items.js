const { onUpdateTrigger, dropOnUpdateTrigger } = require('../knexfile');

exports.up = (knex) => {
  return knex.schema.createTable('featured_items', (table) => {
    table.increments();
    table.integer('item_id').notNullable().unsigned();
    table.string('type').notNullable();
    table.integer('priority').unsigned().defaultTo(0);
    table.timestamp('deleted_at');
    table.timestamps(true, true);
  }).then(() => {
    knex.raw(onUpdateTrigger('featured_items'));
  });
};

exports.down = (knex) => {
  return Promise.all([
    knex.schema.dropTable('featured_items'),
    knex.raw(dropOnUpdateTrigger('featured_items')),
  ]);
};
