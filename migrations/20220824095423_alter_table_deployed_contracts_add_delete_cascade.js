exports.up = (knex) => {
  return knex.schema.alterTable('deployed_contracts', (table) => {
    table.dropForeign('standard_contract_id');
    table.foreign('standard_contract_id').references('id').inTable('standard_contracts').onDelete('CASCADE');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('deployed_contracts', (table) => {
    table.dropForeign('standard_contract_id');
    table.foreign('standard_contract_id').references('id').inTable('standard_contracts');
  });
};
