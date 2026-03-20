exports.up = (knex) => {
  return knex.schema
    .alterTable('nft_histories', (table) => {
      table.dropColumn('event');
      table.jsonb('additional_information');
    })
    .then(() => {
      return knex.schema.alterTable('nft_histories', (table) => {
        table.enum('event', ['mint', 'send_nft', 'transfer_nft', 'burn', 'list', 'buy']).after('transaction_hash');
      });
    });
};

exports.down = (knex) => {
  return knex.schema
    .alterTable('nft_histories', (table) => {
      table.dropColumns(['event', 'additional_information']);
    })
    .then(() => {
      return knex.schema.alterTable('nft_histories', (table) => {
        table.enum('event', ['mint', 'send_nft', 'transfer_nft', 'burn']).after('transaction_hash');
      });
    });
};
