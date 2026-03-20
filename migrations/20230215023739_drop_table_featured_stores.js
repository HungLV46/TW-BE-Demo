exports.up = function(knex) {
  return knex.schema.dropTableIfExists('featured_stores');
};

exports.down = function(knex) {
  return knex.schema.createTable('featured_stores', (table) => {
    table.increments();

    table.integer('store_id').notNullable().unsigned();
    table.integer('priority').notNullable().unsigned();
    table.timestamp('schedule_at');

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('deleted_at');

    table.index('schedule_at');
    table.index('priority');
  });
};
