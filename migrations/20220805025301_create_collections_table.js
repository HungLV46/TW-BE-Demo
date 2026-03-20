exports.up = (knex) => {
  return knex.schema.createTable('collections', (table) => {
    table.increments();

    table.string('name');
    table.string('symbol');
    table.string('contract_address');
    table.integer('standard_contract_id').unsigned();
    table.text('description');
    table.string('logo');
    table.string('feature');
    table.string('banner');
    table
      .enum('type', ['Art', 'Collectibles', 'Music', 'Photography', 'Sports', 'Trading Cards', 'Utility'])
      .defaultTo('Art');
    table.integer('owner_id').notNullable().unsigned();

    table.foreign('standard_contract_id').references('id').inTable('standard_contracts').onDelete('CASCADE');
    table.foreign('owner_id').references('id').inTable('users').onDelete('CASCADE');

    table.timestamp('created_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('deleted_at');
  });
};

exports.down = (knex) => {
  return knex.schema.dropTable('collections');
};
