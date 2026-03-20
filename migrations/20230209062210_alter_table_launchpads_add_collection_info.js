exports.up = (knex) => {
  return knex.schema.alterTable('launchpads', (table) => {
    table.dropColumn('name');
  }).then(() => knex.raw('ALTER TABLE "launchpads" ADD COLUMN collection_information jsonb;'));
};

exports.down = (knex) => {
  return knex.schema.alterTable('launchpads', (table) => {
    table.string('name');
    table.dropColumn('collection_information');
  });
};
