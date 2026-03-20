exports.up = (knex) => {
  return knex.schema.createTable('auction_contracts', (table) => {
    table.increments();

    table.string('name').notNullable();
    table.string('description', 500).notNullable();

    table.integer('standard_contract_id').unsigned();
    table.foreign('standard_contract_id').references('standard_contracts.id').onDelete('SET NULL');

    table.string('contract_address');
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('auction_contracts');
};
