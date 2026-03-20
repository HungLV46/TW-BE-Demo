exports.up = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.smallint('royalty_percentage');
    table.string('royalty_payment_address');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.dropColumn('royalty_percentage');
    table.dropColumn('royalty_payment_address');
  });
};
