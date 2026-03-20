exports.up = (knex) => {
  return knex.schema.alterTable('collection_stats', (table) => {
    table.decimal('mint_price', 40, 0);
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collection_stats', (table) => {
    table.dropColumn('mint_price');
  });
};
