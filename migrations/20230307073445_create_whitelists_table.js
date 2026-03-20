exports.up = function(knex) {
  return knex.schema.createTable('whitelists', (table) => {
    table.increments();
    table.integer('mint_phase_id').unsigned().notNullable();
    table.foreign('mint_phase_id').references('mint_phases.id');
    table.string('aura_address');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('whitelists');
};
