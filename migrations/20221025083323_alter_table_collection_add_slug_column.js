exports.up = (knex) => {
  return knex.schema.alterTable('collections', async (table) => {
    table.string('slug').after('name').unique().index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.dropColumn('slug');
  });
};
