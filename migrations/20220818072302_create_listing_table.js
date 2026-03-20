exports.up = (knex) => {
  return knex.schema.createTable('listings', (table) => {
    table.increments();

    table.integer('nft_id').unsigned().notNullable();
    table.foreign('nft_id').references('nfts.id').onDelete('CASCADE');

    table.integer('store_id').unsigned().notNullable();
    table.foreign('store_id').references('stores.id').onDelete('CASCADE');

    table.string('onchain_id');

    table.integer('seller_id').unsigned();
    table.foreign('seller_id').references('users.id').onDelete('SET NULL');

    table.enum('status', ['ongoing', 'succeeded', 'cancelled', 'ended']).defaultTo('ongoing');

    table.integer('buyer_id').unsigned();
    table.foreign('buyer_id').references('users.id').onDelete('SET NULL');

    table.integer('auction_contract_id').unsigned();
    table.foreign('auction_contract_id').references('auction_contracts.id').onDelete('SET NULL');

    table.timestamp('created_at').index().notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at').index().notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('deleted_at');
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('listings');
};
