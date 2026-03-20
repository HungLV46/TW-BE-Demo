exports.up = (knex) => {
  return knex.schema.alterTable('mint_phases', (table) => {
    table.integer('phase_id').index();
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('mint_phases', (table) => {
    table.dropColumn('phase_id');
  });
};
