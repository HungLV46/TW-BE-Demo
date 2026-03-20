exports.up = (knex) => {
  return knex.schema.alterTable('nft_histories', (table) => {
    table.integer('block_height').unsigned().index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nft_histories', (table) => {
    table.dropColumn('block_height');
  });
};
