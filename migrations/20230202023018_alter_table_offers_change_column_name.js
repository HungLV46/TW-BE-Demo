// need unique key to be able to perform upsert via onConflict query builder of knex
exports.up = (knex) => {
  return knex.schema.alterTable('offers', (table) => {
    table.renameColumn('offerer', 'offerer_address');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('offers', (table) => {
    table.renameColumn('offerer_address', 'offerer');
  });
};
