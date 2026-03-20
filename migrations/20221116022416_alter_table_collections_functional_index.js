exports.up = async (knex) => {
  await knex.raw(`create or replace function listing_order_status(status varchar)
        returns int
        language plpgsql
        immutable
      as 
    $$
    begin
      return CASE WHEN status = 'ongoing' THEN 1 ELSE 2 END;
    end;
    $$`);

  return knex.raw('CREATE INDEX listing_order_status_index ON listings (listing_order_status(status));');
};

exports.down = async (knex) => {
  await knex.raw('drop index listing_order_status_index');
  return knex.raw('drop function if exists listing_order_status');
};
