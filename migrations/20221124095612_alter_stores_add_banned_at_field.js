exports.up = (knex) => {
  return knex.schema.alterTable('stores', (table) => {
    table.timestamp('banned_at').index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('stores', (table) => {
    table.dropIndex('banned_at');
    table.dropColumn('banned_at');
  });
};
