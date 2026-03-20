/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.renameColumn('owner', 'owner_address');
    table.renameColumn('minter', 'minter_address');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.renameColumn('owner_address', 'owner');
    table.renameColumn('minter_address', 'minter');
  });
};
