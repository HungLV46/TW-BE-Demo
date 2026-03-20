exports.up = (knex) => {
  return knex.schema.alterTable('nft_attributes', (table) => {
    table.index('nft_id');
    table.index('collection_id');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nft_attributes', (table) => {
    table.dropIndex('nft_id');
    table.dropIndex('collection_id');
  });
};
