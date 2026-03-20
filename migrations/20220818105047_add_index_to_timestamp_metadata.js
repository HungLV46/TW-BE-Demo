exports.up = async (knex) => {
  await knex.schema.alterTable('collections', (table) => {
    table.index('created_at');
    table.index('updated_at');
  });
  await knex.schema.alterTable('jwts', (table) => {
    table.index('created_at');
    table.index('updated_at');
  });
  await knex.schema.alterTable('nfts', (table) => {
    table.index('created_at');
    table.index('updated_at');
  });
  await knex.schema.alterTable('stores', (table) => {
    table.index('created_at');
    table.index('updated_at');
  });
  await knex.schema.alterTable('sync_txs', (table) => {
    table.index('created_at');
  });
  await knex.schema.alterTable('users', (table) => {
    table.index('created_at');
    table.index('updated_at');
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('collections', (table) => {
    table.dropIndex('created_at');
    table.dropIndex('updated_at');
  });
  await knex.schema.alterTable('jwts', (table) => {
    table.dropIndex('created_at');
    table.dropIndex('updated_at');
  });
  await knex.schema.alterTable('nfts', (table) => {
    table.dropIndex('created_at');
    table.dropIndex('updated_at');
  });
  await knex.schema.alterTable('stores', (table) => {
    table.dropIndex('created_at');
    table.dropIndex('updated_at');
  });
  await knex.schema.alterTable('sync_txs', (table) => {
    table.dropIndex('created_at');
  });
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex('created_at');
    table.dropIndex('updated_at');
  });
};
