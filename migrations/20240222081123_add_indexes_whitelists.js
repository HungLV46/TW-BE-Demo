exports.up = (knex) => {
  return knex.schema.alterTable('whitelists', (table) => {
    table.index('mint_phase_id');
    table.index('aura_address');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('whitelists', (table) => {
    table.dropIndex('mint_phase_id');
    table.dropIndex('aura_address');
  });
};
