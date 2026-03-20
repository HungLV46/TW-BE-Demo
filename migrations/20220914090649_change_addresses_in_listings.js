/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.schema.alterTable('listings', (table) => {
    table.dropForeign('nft_id');
    table.dropForeign('store_id');
    table.dropForeign('seller_id');
    table.dropForeign('buyer_id');
    table.dropForeign('auction_contract_id');
    table.dropColumns(['nft_id', 'store_id', 'seller_id', 'buyer_id', 'onchain_id', 'auction_contract_id']);

    table.string('token_id').after('id');
    table.string('contract_address').after('id');
    table.index(['contract_address', 'token_id']);

    table.string('store_address').notNullable().after('id').index();
    table.string('seller_address').after('id').index();
    table.string('buyer_address').after('id').index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('listings', (table) => {
    table.dropColumns(['token_id', 'contract_address', 'store_address', 'seller_address', 'buyer_address']);

    table.integer('onchain_id').index();
    table.integer('nft_id').unsigned().references('id').inTable('nfts');
    table.integer('store_id').unsigned().references('id').inTable('stores');
    table.integer('seller_id').unsigned().references('id').inTable('users');
    table.integer('buyer_id').unsigned().references('id').inTable('users');
    table.integer('auction_contract_id').unsigned().references('id').inTable('auction_contracts');
  });
};
