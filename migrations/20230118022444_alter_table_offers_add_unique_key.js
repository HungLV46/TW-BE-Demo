// need unique key to be able to perform upsert via onConflict query builder of knex
exports.up = (knex) => {
  return knex.schema.alterTable('offers', (table) => {
    table.unique(['contract_address', 'token_id', 'store_address']);
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('offers', (table) => {
    table.dropUnique(['contract_address', 'token_id', 'store_address']);
  });
};
