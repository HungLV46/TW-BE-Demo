exports.up = (knex) => {
  return knex.schema.alterTable('standard_contracts', (table) => {
    table.string('checksum');
  });
};
  
exports.down = (knex) => {
  return knex.schema.alterTable('standard_contracts', (table) => {
    table.dropColumn('checksum');
  });
};
