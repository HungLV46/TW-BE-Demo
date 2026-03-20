const { onUpdateTrigger } = require('../knexfile');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async (knex) => {
  // create on update trigger
  const ON_UPDATE_TIMESTAMP_FUNCTION = `
  CREATE OR REPLACE FUNCTION on_update_timestamp()
  RETURNS trigger AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$ language 'plpgsql';`;
  await knex.raw(ON_UPDATE_TIMESTAMP_FUNCTION);

  return Promise.all([
    knex.raw(onUpdateTrigger('auction_contracts')),
    knex.raw(onUpdateTrigger('collections')),
    knex.raw(onUpdateTrigger('deployed_contracts')),
    knex.raw(onUpdateTrigger('jwts')),
    knex.raw(onUpdateTrigger('listings')),
    knex.raw(onUpdateTrigger('nfts')),
    knex.raw(onUpdateTrigger('standard_contracts')),
    knex.raw(onUpdateTrigger('stores')),
    knex.raw(onUpdateTrigger('sync_txs')),
    knex.raw(onUpdateTrigger('users')),
  ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  // TODO will drop trigger
};
