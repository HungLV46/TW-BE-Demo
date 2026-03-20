exports.up = (knex) => {
  return knex.schema.alterTable('stores', (table) => {
    table.dropColumn('deleted_at');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('stores', (table) => {
    table.timestamp('deleted_at');
  });
};
