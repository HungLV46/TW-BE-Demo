exports.up = (knex) => {
  return knex.schema.createTable('sync_txs', (table) => {
    table.increments();

    table.integer('height').index().notNullable();
    table.string('key').index().notNullable();
    table.string('value').index().notNullable();
    table.string('hash').index().notNullable();
    table.json('raw_data').notNullable();

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('sync_txs');
};
