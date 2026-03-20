exports.up = (knex) => {
  return knex.schema.alterTable('collection_stats', (table) => {
    table.index('volume');
    table.index('duration_type');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collection_stats', (table) => {
    table.dropIndex('volume');
    table.dropIndex('duration_type');
  });
};
