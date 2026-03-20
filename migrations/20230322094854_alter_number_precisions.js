exports.up = function(knex) {
  return knex.raw(`
    ALTER TABLE listings ALTER COLUMN latest_price TYPE decimal(40, 0);
    ALTER TABLE collection_stats ALTER COLUMN volume TYPE decimal(40, 0);
    ALTER TABLE collection_stats ALTER COLUMN prev_volume TYPE decimal(40, 0);
    ALTER TABLE collection_stats ALTER COLUMN floor_price TYPE decimal(40, 0);
    ALTER TABLE offers ALTER COLUMN order_price TYPE decimal(40, 0);
    ALTER TABLE nft_attributes ALTER COLUMN numeric_value TYPE decimal(40, 6);
  `)
};

exports.down = function(knex) {
  // no need to rollback
};
