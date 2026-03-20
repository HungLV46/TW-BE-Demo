exports.up = (knex) => {
  return knex.schema.alterTable('user_notifications', (table) => {
    table.index('user_id');
    table.index('notification_id');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('user_notifications', (table) => {
    table.dropIndex('user_id');
    table.dropIndex('notification_id');
  });
};
