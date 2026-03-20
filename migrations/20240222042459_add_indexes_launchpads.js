exports.up = (knex) => {
  return knex.schema.alterTable('launchpads', (table) => {
    table.index('collection_address');
    table.index('standard_contract_id');
    table.index('published_at');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('launchpads', (table) => {
    table.dropIndex('collection_address');
    table.dropIndex('standard_contract_id');
    table.dropIndex('published_at');
  });
};
