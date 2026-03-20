const { onUpdateTrigger, dropOnUpdateTrigger } = require('../knexfile');

exports.up = (knex) => {
  return knex.schema.createTable('notifications', (table) => {
    table.increments();

    table.json('content');
    table.string('event');
    table.timestamps(true, true);
  }).then(() => {
    knex.raw(onUpdateTrigger('notifications'));
  });
};

exports.down = (knex) => {
  return Promise.all([
    knex.schema.dropTable('notifications'),
    knex.raw(dropOnUpdateTrigger('notifications')),
  ]);
};

