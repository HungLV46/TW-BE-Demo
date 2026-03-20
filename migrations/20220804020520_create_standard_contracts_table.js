exports.up = (knex) => {
  return knex.schema.createTable('standard_contracts', (table) => {
    table.increments();

    table.string('name').notNullable();
    table.string('description').notNullable();
    table.integer('code_id').notNullable();
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('standard_contracts');
};
