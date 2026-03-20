exports.up = (knex) => {
  return knex.schema.alterTable('user_device_tokens', (table) => {
    table.dropUnique('user_id');
    table.unique(['user_id', 'fcm_token']);
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('user_device_tokens', (table) => {
    table.dropUnique(['user_id', 'fcm_token']);
    table.unique('user_id');
  });
};
