exports.up = (knex) => {
  return knex.schema.alterTable('nft_histories', (table) => {
    table.dropColumns(['quantity', 'decimal', 'unit']);
    table.json('price').after('event');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nft_histories', (table) => {
    table.dropColumn('price');
    table.bigInteger('quantity').unsigned().after('event');
    table.integer('decimal').unsigned().after('quantity');
    table.string('unit').after('decimal');
  });
};
