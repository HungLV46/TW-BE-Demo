exports.up = (knex) => {
  return knex.schema.createTable('sync_informations', (table) => {
    table.increments();

    table.string('key').notNullable();
    table.integer('height').notNullable();
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('sync_informations');
};
