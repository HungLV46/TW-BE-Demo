exports.up = (knex) => {
  return knex.schema.createTable('admin_users', (table) => {
    table.increments();

    table.string('email').notNullable().unique();
    table.string('role').notNullable().defaultTo('ADMIN');
    table.string('google_id');
    table.string('name');
    table.string('avatar');

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('deleted_at');
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('admin_users');
};
