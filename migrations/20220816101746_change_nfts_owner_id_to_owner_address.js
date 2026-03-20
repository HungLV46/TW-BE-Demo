exports.up = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.dropColumn('owner');
    table.dropForeign('owner_id');
    table.dropColumn('owner_id');

    table.string('owner_address').index().after('token_id');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('nfts', (table) => {
    table.string('owner').notNullable().index().after('token_id');
    table.integer('owner_id').unsigned().after('owner');
    table.foreign('owner_id').references('users.id').onDelete('SET NULL');

    table.dropColumn('owner_address');
  });
};
