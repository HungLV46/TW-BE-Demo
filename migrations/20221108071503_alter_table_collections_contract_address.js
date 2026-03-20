exports.up = (knex) => {
  return knex.schema
    .alterTable('collections', (table) => {
      table.unique('contract_address');
    })
    .then(() =>
      knex.schema.alterTable('collection_stats', (table) => {
        table.foreign('contract_address').references('contract_address').inTable('collections').onDelete('CASCADE');
      }),
    );
};

exports.down = (knex) => {
  return knex.schema
    .alterTable('collection_stats', (table) => {
      table.dropForeign('contract_address');
    })
    .then(() =>
      knex.schema.alterTable('collections', (table) => {
        table.dropUnique('contract_address');
      }),
    );
};
