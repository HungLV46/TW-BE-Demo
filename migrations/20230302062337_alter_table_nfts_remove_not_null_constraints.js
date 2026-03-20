exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.setNullable('name');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropNullable('name');
  });
};
