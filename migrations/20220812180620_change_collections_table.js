/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.string('minter').notNullable();
    table.dropForeign('owner_id');
    table.dropColumn('owner_id');
    table.string('owner').notNullable().index();
    table.string('type').alter();
    table.index('contract_address');
    table.index('minter');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.dropColumns(['owner', 'minter']);
    table.integer('owner_id').notNullable().unsigned();
    table.foreign('owner_id').references('id').inTable('users').onDelete('CASCADE');
  });
};
