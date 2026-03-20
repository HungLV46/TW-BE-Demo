exports.up = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.string('website');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.dropColumn('website');
  });
};
