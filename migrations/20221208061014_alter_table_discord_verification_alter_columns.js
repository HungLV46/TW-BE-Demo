/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = (knex) => {
  // because authorization is a PGSQL reserved keyword so it needs to be changed.
  // https://www.postgresql.org/docs/current/sql-keywords-appendix.html
  return knex.raw('ALTER TABLE collection_verifications DROP "authorization";').then(() =>
    knex.raw(`ALTER TABLE collection_verifications ADD authorization_info jsonb;
      ALTER TABLE collection_verifications ADD additional_info jsonb;
      ALTER TABLE collection_verifications DROP guild_name;`),
  );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = (knex) => {
  return knex.schema.alterTable('collection_verifications', (table) => {
    table.jsonb('authorization');
    table.dropColumn('authorization_info');
    table.dropColumn('additional_info');
    table.string('guild_name');
  });
};
