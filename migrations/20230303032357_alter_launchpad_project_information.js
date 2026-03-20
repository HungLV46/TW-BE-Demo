/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  return knex.raw(`
    ALTER TABLE "launchpads" ALTER "project_information" TYPE jsonb USING project_information::jsonb;
    ALTER TABLE "launchpads" ADD COLUMN "collection_address" VARCHAR(255);
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('launchpads', (table) => {
    table.text('project_information').alter();
  });
};
