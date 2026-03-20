exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.index('burned_at');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropIndex('burned_at');
  });
};
