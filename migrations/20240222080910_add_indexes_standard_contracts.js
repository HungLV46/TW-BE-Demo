exports.up = (knex) => {
  return knex.schema.alterTable('standard_contracts', (table) => {
    table.index('status');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('standard_contracts', (table) => {
    table.dropIndex('status');
  });
};
