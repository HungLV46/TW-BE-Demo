const { onUpdateTrigger } = require('../knexfile');

exports.up = (knex) => {
  return knex.schema
    .createTable('collection_stats', (table) => {
      table.increments();

      table.string('contract_address').notNullable();
      table.string('duration_type').notNullable();
      table.unique(['contract_address', 'duration_type']); // to use knex.onConflic using this 2 fields

      table.decimal('volume', 18, 6);
      table.decimal('prev_volume', 18, 6);
      table.decimal('floor_price', 18, 6);
      table.integer('sales');
      table.integer('total_owners');
      table.integer('listed_nfts');
      table.integer('total_nfts');

      table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
      table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
    })
    .then(() => {
      knex.raw(onUpdateTrigger('collection_stats'));
    });
};

exports.down = (knex) => {
  return knex.schema.dropTable('collection_stats');
};
