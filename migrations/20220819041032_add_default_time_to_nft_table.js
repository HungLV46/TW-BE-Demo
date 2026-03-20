exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()')).alter();
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()')).alter();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.timestamp('created_at').alter();
    table.timestamp('updated_at').alter();
  });
};
