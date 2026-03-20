/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('offers', (table) => {
    table.increments('id').primary();
    table.string('offerer').notNullable().index();
    table.string('token_id').index();
    table.string('contract_address').notNullable().index();
    table.string('store_address').notNullable().index();
    table.string('status').notNullable().index();
    table.jsonb('price').notNullable();
    table.timestamp('end_time').index();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('offers');
};
