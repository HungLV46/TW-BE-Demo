exports.up = (knex) => {
  return knex.schema.alterTable('collection_stats', (table) => {
    table.index('floor_price');
    table.index('total_nfts');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collection_stats', (table) => {
    table.dropIndex('floor_price');
    table.dropIndex('total_nfts');
  });
};
