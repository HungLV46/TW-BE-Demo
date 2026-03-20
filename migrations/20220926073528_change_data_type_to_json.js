/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async (knex) => {
  await knex.raw(`ALTER TABLE "nfts"
    ALTER "metadata" TYPE jsonb USING metadata::jsonb,
    ALTER "metadata" DROP DEFAULT,
    ALTER "metadata" SET NOT NULL;`);
  await knex.raw(`ALTER TABLE "listings"
    ALTER "auction_config" TYPE jsonb USING auction_config::jsonb,
    ALTER "auction_config" DROP DEFAULT,
    ALTER "auction_config" SET NOT NULL;`);
  await knex.raw(`ALTER TABLE "stores"
    ALTER "extra_information" TYPE jsonb USING extra_information::jsonb,
    ALTER "extra_information" DROP DEFAULT;`);
  await knex.raw(`ALTER TABLE "nft_histories"
    ALTER "additional_information" TYPE jsonb USING additional_information::jsonb,
    ALTER "additional_information" DROP DEFAULT;`);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {};
