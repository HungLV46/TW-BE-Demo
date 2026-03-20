const { onUpdateTrigger, dropOnUpdateTrigger } = require('../knexfile');

exports.up = function(knex) {
  return knex.schema.createTable('auction_histories', (table) => {
    table.increments();
    table.string('auction_event').comment('create, bid, settle')

    table.string('contract_address');
    table.string('token_id');
    table.string('auction_address');
    table.string('seller_address');

    table.jsonb('config');
    table.string('bidder_address').index();
    table.decimal('bidding_price', 40, 0).index();

    table.integer('auction_create_id').unsigned();
    table.index(['contract_address', 'token_id', 'auction_address', 'auction_create_id', 'auction_event']);

    table.timestamps(true, true);
  }).then(() => {
    knex.raw(onUpdateTrigger('auction_histories'));
  });
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.dropTable('auction_histories'),
    knex.raw(dropOnUpdateTrigger('auction_histories')),
  ])
};
