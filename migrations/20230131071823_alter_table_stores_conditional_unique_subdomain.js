const INDEX_NAME = 'active_store_subdomain_unique';
exports.up = (knex) => {
  return knex.schema.alterTable('stores', (table) => {
    table.dropUnique('subdomain');
  }).then(() => 
    knex.raw(`CREATE UNIQUE INDEX ${INDEX_NAME} ON stores (subdomain) WHERE status = 'active'`)
  );
};

exports.down = (knex) => {
  // no rollback
};
