exports.up = (knex) => {
  return knex.schema.alterTable('users', (table) => {
    table.string('name').after('aura_address');
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()')).alter();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('name');
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()')).alter();
  });
};
