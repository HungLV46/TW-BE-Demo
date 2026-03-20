exports.up = (knex) => {
  return knex.schema
    .alterTable('collections', (table) => {
      // The column 'type' is altered from enum to string but the "enum value check constraint" still remains.
      // So this migration is for removing that constraint.
      // The Name of the constraint might not be the same in different databases so the column is dropped then recreated.
      table.dropColumn('type');
    })
    .then(() =>
      knex.schema.alterTable('collections', (table) => {
        table.string('type').after('banner');
      }),
    );
};

exports.down = () => {
  // recreating the constraint is kinda useless so there is no "down" function.
};
