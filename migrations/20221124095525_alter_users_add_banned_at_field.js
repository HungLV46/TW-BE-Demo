exports.up = (knex) => {
  return knex.schema.alterTable('users', (table) => {
    table.timestamp('banned_at').index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('users', (table) => {
    table.dropIndex('banned_at');
    table.dropColumn('banned_at');
  });
};
