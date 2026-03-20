exports.up = (knex) => {
  return knex.schema.alterTable('jwts', (table) => {
    table.dropForeign('user_id');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = (knex) => {
  return knex.schema.alterTable('jwts', (table) => {
    table.dropForeign('user_id');
    table.foreign('user_id').references('id').inTable('users');
  });
};
