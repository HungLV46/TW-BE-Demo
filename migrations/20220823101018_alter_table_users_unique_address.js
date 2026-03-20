exports.up = (knex) => {
  return knex.schema.alterTable('users', (table) => {
    table.dropIndex('aura_address');
    table.unique('aura_address');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('users', (table) => {
    table.dropUnique('aura_address');
    table.index('aura_address');
  });
};
