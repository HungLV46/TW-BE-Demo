// remove enum check so the field event in the table nft_histories can accept a wider range of values
exports.up = (knex) => {
  return knex.raw('ALTER TABLE nft_histories DROP CONSTRAINT IF EXISTS nft_histories_event_check');
};

exports.down = (knex) => {
  // no rollback
};
