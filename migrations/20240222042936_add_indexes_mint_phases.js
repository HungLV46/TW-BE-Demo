exports.up = (knex) => {
  return knex.schema.alterTable('mint_phases', (table) => {
    table.index('launchpad_id');
    table.index('created_at');
    table.index('updated_at');
    table.index('type');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('mint_phases', (table) => {
    table.dropIndex('launchpad_id');
    table.dropIndex('created_at');
    table.dropIndex('updated_at');
    table.dropIndex('type');
  });
};
