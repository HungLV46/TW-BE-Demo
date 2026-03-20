/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async (knex) => {
  await knex.raw(`ALTER TABLE "mint_phases"
    ALTER "config" TYPE jsonb USING config::jsonb;`);
  await knex.raw(`ALTER TABLE "offers"
    ALTER "price" TYPE jsonb USING price::jsonb;`);
  await knex.raw(`ALTER TABLE "collections"
    ALTER "metadata" TYPE jsonb USING metadata::jsonb;`);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async (knex) => {
  // no roll back
};
