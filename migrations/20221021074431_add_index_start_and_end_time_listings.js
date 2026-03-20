/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  // add start_time and end_time to listings
  return knex.schema.table('listings', (table) => {
    table.timestamp('start_time').index();
    table.timestamp('end_time').index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  // remove start_time and end_time from listings
  return knex.schema.table('listings', (table) => {
    table.dropColumn('start_time');
    table.dropColumn('end_time');
  });
};
