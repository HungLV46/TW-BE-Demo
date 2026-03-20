/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  const defaultType = 'Others';
  return knex('collections').whereNull('type').update({ type: defaultType })
    .then(() => knex.raw(`ALTER TABLE collections ALTER COLUMN type SET DEFAULT '${defaultType}', ALTER COLUMN type SET NOT NULL;`));
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.raw('ALTER TABLE collections ALTER COLUMN type DROP NOT NULL, ALTER COLUMN type DROP DEFAULT;');
};
