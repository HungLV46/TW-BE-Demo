exports.up = (knex) => {
  return knex.schema.alterTable('launchpads', (table) => {
    table.string('slug').unique();
  }).then(() => knex.raw(`
    UPDATE launchpads 
    SET slug = collections.slug
    FROM collections 
    WHERE launchpads.collection_address = collections.contract_address
  `))
};

exports.down = (knex) => {
  return knex.schema.alterTable('launchpads', (table) => {
    table.dropColumn('slug');
  });
};
