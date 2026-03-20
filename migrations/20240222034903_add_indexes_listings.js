exports.up = (knex) => {
  return knex.schema.alterTable('listings', (table) => {
    table.index('status');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('listings', (table) => {
    table.dropIndex('status');
  });
};
