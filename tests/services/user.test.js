const { ServiceBroker, Context } = require('moleculer');
const ServiceSchema = require('@services/users.service');
const { User } = require('@models');
const knex = require('@config/database');
const { faker } = require('@faker-js/faker');

describe('Test User', () => {
  let broker = new ServiceBroker({ logger: false });
  let context = new Context(broker, { logger: false });
  broker.createService(ServiceSchema);

  beforeAll(async () => {
    await broker.start();
    await knex.seed.run({ specific: 'user.seed.js' });
  });
  afterAll(async () => {
    await broker.stop();
  });

  describe('Test GET /me', () => {
    it('Get user success!', async () => {
      // setup.
      await User.query().insert({
        aura_address: `aura${faker.datatype.string(62)}`,
        name: faker.internet.userName(),
      });

      const user = await User.query()
        .select('id', ...User.selectableProps)
        .orderBy('id', 'desc')
        .first();
      context.meta = { user: user };

      // excute.
      const result = await context.call('user.me');

      delete user.id;
      // verify.
      expect(result.data).toMatchObject(user);
    });

    it('Cannot get nonexistent user!', async () => {
      try {
        // excute.
        context.meta = { user: { id: 999999 } };
        await context.call('user.me');
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('User not found!');
      }
    });

    it('Cannot get deleted user!', async () => {
      try {
        // setup.
        const user = await User.query().select().first();
        await User.query().findById(user.id).patch({ deleted_at: '2022-08-11 07:15:14' }); // delete 1 record

        context.meta = { user: { id: user.id } };
        // excute.
        await context.call('user.me');
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('User not found!');
      }
    });
  });

  describe('Test GET /users/:address', () => {
    it('Get a user', async () => {
      // setup.
      const user = await User.query().select(User.selectableProps).whereNotDeleted().first();

      // excute.
      const result = await context.call('user.show', { address: user.aura_address });

      // verify.
      expect(result.data).toMatchObject(user);
    });

    it('Cannot get nonexistent user!', async () => {
      try {
        // excute.
        await context.call('user.show', { address: 'nonexistent user' });
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('User not found!');
      }
    });

    it('Cannot get deleted users!', async () => {
      try {
        // setup.
        const user = await User.query().select().first();
        await User.query().findById(user.id).patch({ deleted_at: '2022-08-11 07:15:14' }); // delete 1 record

        // excute.
        await context.call('user.show', { address: user.aura_address });
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('User not found!');
      }
    });
  });

  describe('Test POST /me', () => {
    it('Update a user success', async () => {
      // setup.
      const user = await User.query().select(User.selectableProps).whereNotDeleted().first();

      context.meta = { user: user };
      const updateData = {
        name: 'update name',
        avatar: 'https://examplexxx.com/update_atatar.jpg',
        cover_picture: 'https://examplexxx.com/update_cover.jpg',
      };
      // excute.
      await context.call('user.update', updateData);

      const userAfterUpdate = await user.$query().first();
      // verify.
      expect(userAfterUpdate).toMatchObject(updateData);
    });

    it('Cannot Update nonexistent user!', async () => {
      try {
        // excute.
        context.meta = { user: { id: 999999 } };
        await context.call('user.update', { name: 'update name' });
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('User not found!');
      }
    });

    it('Cannot Update deleted user!', async () => {
      try {
        // setup.
        const user = await User.query().select().first();
        await User.query().findById(user.id).patch({ deleted_at: '2022-08-11 07:15:14' }); // delete 1 record

        context.meta = { user: { id: user.id } };
        // excute.
        await context.call('user.update', { name: 'update name' });
      } catch (error) {
        // verify.
        expect(error.code).toBe(404);
        expect(error.message).toBe('User not found!');
      }
    });
  });
});
