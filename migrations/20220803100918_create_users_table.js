exports.up = (knex) => {
  return knex.schema.createTable('users', (table) => {
    table.increments();

    table.string('aura_address');
    table.string('avatar');

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('deleted_at');
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('users');
};
