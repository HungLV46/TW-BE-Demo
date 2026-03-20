exports.up = (knex) => {
  return knex.schema.alterTable('listings', (table) => {
    // use default value to automatically update all previous records to 'fixed_price'
    // to prevent old code and tests from being failed
    table.string('type').notNullable().default('fixed_price').index();
  })
};

exports.down = (knex) => {
  return knex.schema.alterTable('listings', (table) => {
    table.dropColumn('type');
  });
};
