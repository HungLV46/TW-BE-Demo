exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.unique(['contract_address', 'token_id']);
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropUnique(['contract_address', 'token_id']);
  });
};
