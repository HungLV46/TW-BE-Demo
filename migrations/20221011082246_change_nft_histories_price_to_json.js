/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.raw(`ALTER TABLE "nft_histories"
    ALTER "price" TYPE jsonb USING price::jsonb,
    ALTER "price" DROP DEFAULT;`);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {};
