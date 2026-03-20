/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.createTable('nfts', (table) => {
    table.increments();

    table.string('name').notNullable();
    table.string('token_id').notNullable().index();
    table.string('owner').notNullable().index();

    table.integer('owner_id').unsigned();
    table.foreign('owner_id').references('users.id').onDelete('SET NULL');

    table.integer('collection_id').unsigned().notNullable();
    table.foreign('collection_id').references('collections.id').onDelete('CASCADE');
    table.json('metadata').notNullable();

    table.timestamps();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.dropTable('nfts');
};
