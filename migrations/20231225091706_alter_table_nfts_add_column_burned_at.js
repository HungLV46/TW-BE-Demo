exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.timestamp('burned_at');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropColumn('burned_at');
  });
};
