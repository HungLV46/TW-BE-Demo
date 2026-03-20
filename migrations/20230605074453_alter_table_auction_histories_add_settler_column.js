exports.up = (knex) => {
  return knex.schema.alterTable('auction_histories', (table) => {
    table.string('settler_address');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('auction_histories', (table) => {
    table.dropColumn('settler_address');
  });
};
