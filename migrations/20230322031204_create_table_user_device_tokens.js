const { onUpdateTrigger, dropOnUpdateTrigger } = require('../knexfile');

exports.up = (knex) => {
  return knex.schema.createTable('user_device_tokens', (table) => {
    table.increments();

    table.integer('user_id').unsigned().references('users.id').unique();
    // Firebase registered token
    table.string('fcm_token');
    // table.string('device_id');
    // table.unique(['user_id', 'device_id'], { indexName: 'user_id_device_id_user_device_tokens_unique_constraint' });
    //TODO add mobile os specification
    // table.string('os');
    // table.string('os_version');
    // table.string('device_model');
    table.timestamps(true, true);
  }).then(() => {
    knex.raw(onUpdateTrigger('user_device_tokens'));
  });
};

exports.down = (knex) => {
  return Promise.all([
    knex.schema.dropTable('user_device_tokens'),
    knex.raw(dropOnUpdateTrigger('user_device_tokens')),
  ]);
};

