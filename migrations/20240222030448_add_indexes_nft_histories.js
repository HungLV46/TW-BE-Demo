exports.up = (knex) => {
  return knex.schema.alterTable('nft_histories', (table) => {
    table.index('event');
    table.index(['contract_address', 'token_id']);
    table.index('transaction_time');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nft_histories', (table) => {
    table.dropIndex('event');
    table.dropIndex(['contract_address', 'token_id']);
    table.dropIndex('transaction_time');
  });
};
