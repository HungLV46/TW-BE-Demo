exports.up = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.dropForeign('standard_contract_id');
    table.foreign('standard_contract_id').references('id').inTable('standard_contracts').onDelete('SET NULL');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.dropForeign('standard_contract_id');
    table.foreign('standard_contract_id').references('id').inTable('standard_contracts').onDelete('CASCADE');
  });
};
