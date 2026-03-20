exports.up = (knex) => {
  return knex.schema.createTable('user_notifications', (table) => {
    table.increments();
    table.integer('user_id').unsigned().references('users.id');
    table.integer('notification_id').unsigned().references('notifications.id');
    table.boolean('is_read').defaultTo(false);
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('user_notifications');
};

