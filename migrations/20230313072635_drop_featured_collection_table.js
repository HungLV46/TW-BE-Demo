exports.up = function(knex) {
  return knex.schema.dropTable('featured_collections');
};

exports.down = function(knex) {
  return knex.schema.createTable('featured_collections', (table) => {
    table.increments();

    table.integer('collection_id').notNullable().unsigned();
    table.integer('priority').notNullable().unsigned();
    table.string('image').notNullable();
    table.string('description');
    table.timestamp('schedule_at');

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('deleted_at');

    table.index('schedule_at');
    table.index('priority');
  });
};
