exports.up = (knex) => {
  return knex.schema.createTable('stores', (table) => {
    table.increments();

    table.string('subdomain').notNullable().unique();
    table.string('title');
    table.string('description', 500);
    table.json('extra_information');
    table.string('contract_address');
    table.integer('standard_contract_id').unsigned();
    table.integer('owner_id').unsigned();
    table.enum('status', ['pending', 'active', 'inactive']).defaultTo('inactive');

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('deleted_at');

    table.foreign('standard_contract_id').references('id').inTable('standard_contracts').onDelete('SET NULL');
    table.foreign('owner_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('stores');
};
