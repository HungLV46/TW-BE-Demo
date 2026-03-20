exports.up = (knex) => {
  return knex.schema
    .alterTable('offers', async (table) => {
      table.decimal('order_price', 18, 6).index();
    })
    .then(() =>
      // if price value is number, use price directly to update order_price
      knex('offers')
        .whereNotNull('price')
        .whereNull(knex.raw("price::jsonb->>'amount'"))
        .update({
          order_price: knex.raw( "cast(price as decimal(18, 6))"),
        }))
    .then(() =>
      // if price value is object use price.amount to update order_price
      knex('offers')
        .whereNotNull(knex.raw("price::jsonb->>'amount'"))
        .update({
          order_price: knex.raw("cast(price::jsonb->>'amount' as decimal(18, 6))"),
        }));
};

exports.down = (knex) => {
  return knex.schema.alterTable('offers', (table) => {
    table.dropColumn('order_price');
  });
};
