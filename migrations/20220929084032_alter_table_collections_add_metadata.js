exports.up = (knex) => {
  return knex.schema.alterTable('collections', async (table) => {
    table.jsonb('metadata');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.dropColumn('metadata');
  });
};
