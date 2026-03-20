exports.up = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.string('social_link_twitter');
    table.string('social_link_telegram');
    table.string('social_link_discord');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('collections', (table) => {
    table.dropColumn('social_link_twitter');
    table.dropColumn('social_link_telegram');
    table.dropColumn('social_link_discord');
  });
};
