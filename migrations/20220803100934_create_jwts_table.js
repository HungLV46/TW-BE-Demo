exports.up = (knex) => {
  return knex.schema.createTable('jwts', (table) => {
    table.increments();

    table.string('jti').notNullable().unique();
    table.integer('user_id').unsigned().notNullable();
    table.foreign('user_id').references('id').inTable('users');

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at', true).notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('deleted_at');
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('jwts');
};
