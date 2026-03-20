exports.up = (knex) => {
  return knex.schema.createTable('nft_histories', (table) => {
    table.increments();

    table.string('transaction_hash');
    table.enum('event', ['mint', 'send_nft', 'transfer_nft', 'burn']);

    table.bigInteger('quantity').unsigned();
    table.integer('decimal').unsigned();
    table.string('unit');

    table.string('from_address').index();
    table.string('to_address').index();

    table.string('token_id').index().notNullable();

    table.timestamp('transaction_time').defaultTo(knex.raw('now()'));
    table.string('contract_address');
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('nft_histories');
};
