exports.up = (knex) => {
  return knex.schema.createTable('nft_attributes', (table) => {
    table.increments();

    table.integer('collection_id').notNullable();
    table.foreign('collection_id').references('id').inTable('collections').onDelete('CASCADE');

    table.integer('nft_id').notNullable();
    table.foreign('nft_id').references('id').inTable('nfts').onDelete('CASCADE');

    table.string('trait_type').notNullable().index();
    table.string('display_type').notNullable().index();
    table.string('string_value').index();
    table.decimal('numeric_value', 18, 6).index();
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('nft_attributes');
};
