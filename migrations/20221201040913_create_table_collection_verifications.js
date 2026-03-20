exports.up = (knex) => {
  return knex.schema.createTable('collection_verifications', (table) => {
    table.increments();

    table.string('contract_address').notNullable();
    table.string('type').notNullable();
    table.unique(['contract_address', 'type']); // to use knex.onConflic using this 2 fields

    table.jsonb('authorization');

    table.string('guild_name');
    table.string('invite_link');

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('collection_verifications');
};
