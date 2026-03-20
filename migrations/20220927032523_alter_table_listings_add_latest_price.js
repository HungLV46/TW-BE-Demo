exports.up = (knex) => {
  return knex.schema
    .alterTable('listings', async (table) => {
      table.decimal('latest_price', 18, 6).index();
    })
    .then(() =>
      knex('listings').update({
        latest_price: knex.raw(
          "cast(auction_config::json->'config'->'FixedPrice'->'price'->>'amount' as decimal(18, 6))",
        ),
      }),
    );
};

exports.down = (knex) => {
  return knex.schema.alterTable('listings', (table) => {
    table.dropColumn('latest_price');
  });
};
