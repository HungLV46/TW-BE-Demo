/**
 * In listings table, update attribute name: FixedPrice -> fixed_price
 */
exports.up = function(knex) {
  return knex('listings').whereNotNull(knex.raw("auction_config::json->'config'->'FixedPrice'")).update({
    auction_config: knex.raw(
      `jsonb_set(
        auction_config::jsonb, 
        '{config,fixed_price}',
        jsonb_extract_path(auction_config::jsonb,'config','FixedPrice'), 
        true
      ) #- '{config, FixedPrice}'`)
  })
};

/**
 * Reverse update attribute name
 */
exports.down = function(knex) {
  return knex('listings')
  .whereNotNull(knex.raw("auction_config::json->'config'->'fixed_price'")).update({
    auction_config: knex.raw(
      `jsonb_set(
        auction_config::jsonb, 
        '{config,FixedPrice}',
        jsonb_extract_path(auction_config::jsonb,'config','fixed_price'), 
        true
      ) #- '{config, fixed_price}'`)
  })
};
