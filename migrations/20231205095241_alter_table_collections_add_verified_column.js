/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('collections', (table) => {
      table.timestamp('verified_at').index();
    })
    .then(() =>
      knex('collections')
        .update({ verified_at: new Date() })
        .whereIn('contract_address', function () {
          this.select('collection_address').from('launchpads');
        }));
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('collections', (table) => {
    table.dropColumn('verified_at');
  });
};
