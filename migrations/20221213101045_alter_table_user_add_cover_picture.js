exports.up = (knex) => {
  return knex.schema.alterTable('users', (table) => {
    table.string('cover_picture');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('cover_picture');
  });
};
