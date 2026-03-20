const { UserFactory } = require('../tests/factories/user_factory');

exports.seed = async (knex) => {
  if (process.env.DB_RESET || process.env.NODE_ENV === 'test') {
    await knex('user_device_tokens').del();
    await knex('user_notifications').del();
    await knex('users').del();
  }

  const users = UserFactory.buildList(3);
  return knex('users').insert(users);
};
