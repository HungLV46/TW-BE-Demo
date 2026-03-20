const { ServiceBroker, Context } = require('moleculer');
const ServiceSchema = require('@services/auth.service');
const { Jwt, AdminUser, UserDeviceToken } = require('@models');
const { TokenHandler } = require('@helpers/jwt-token');
const knex = require('@config/database');
const { AuthenticationError } = require('@helpers/errors');
const { JWT } = require('google-auth-library');
const { MoleculerClientError } = require('moleculer').Errors;
const _ = require('lodash');

jest.setTimeout(30000);

const mockGGClientPayload = jest.fn();
jest.mock('@helpers/google-oauth2-client', () =>
  ({
    verifyIdToken: async () =>
      ({
        getPayload: () =>
          mockGGClientPayload(),
      }),
  }));

const mockAdminUser = {
  id: 1,
  email: 'son.huynh.admin@aura.com',
  role: 'admin',
};

describe('Test auth.service', () => {
  let broker = new ServiceBroker({ logger: false });
  let context = new Context(broker, { logger: false });
  broker.createService(ServiceSchema);

  beforeAll(async () => {
    await broker.start();
    await Promise.all([knex.seed.run({ specific: 'user.seed.js' })]);

    mockGGClientPayload.mockReturnValue({});
  }, 100000);
  afterAll(async () => {
    await broker.stop();

    mockGGClientPayload.mockClear();
  });

  describe('Test POST /admin/login', () => {
    beforeAll(async () => {
      await AdminUser.query().insert(mockAdminUser);
    }, 100000);
    afterAll(async () => {
      await AdminUser.query().where('id', '=', mockAdminUser.id).delete(true);
    });

    it('should login with admin success', async () => {
      mockGGClientPayload.mockReturnValue(mockAdminUser);

      const result = await context.call('auth.adminLogin', {
        idToken: 'token',
      });

      const validate = await context.call('auth.verifyAdminToken', {
        token: `${result.data.token_type} ${result.data.access_token}`,
      });

      expect(validate.id).toEqual(mockAdminUser.id);
    });

    it('should login with admin fail', async () => {
      mockGGClientPayload.mockReturnValue({ email: 'fail.user@aura.com' });

      const result = context.call('auth.adminLogin', {
        idToken: 'token',
      });
      await expect(result).rejects.toThrow(MoleculerClientError);
    });
  });

  describe('Test GET /auth-webhook', () => {
    beforeAll(async () => {
      await AdminUser.query().insert(mockAdminUser);
    }, 100000);
    afterAll(async () => {
      await AdminUser.query().where('id', '=', mockAdminUser.id).delete(true);
    });

    it('should authenticate with admin success', async () => {
      const { token } = AdminUser.generateToken(mockAdminUser);

      context.meta.authorization = `Bearer ${token.accessToken}`;
      const result = await context.call('auth.authWebhook');

      expect(result).toMatchObject({
        'X-Hasura-User-Id': mockAdminUser.id.toString(),
        'X-Hasura-Role': mockAdminUser.role,
      });
    });

    it('should authenticate with user success', async () => {
      const loginInfo = await context.call('auth.login', {
        data: '1659496276785',
        pubkey: 'A4ALmwgw/hIubQD7ZYu0cnL1WXycXN+ONujVxSY2nHCp',
        signature: 'NF2WvijnaR0Xcyh7GDCK6/tuvBLftnjpWAMaZa/xta4J/uku/OIr448OsKnyIR7VmcfClL/9KA3WChsQuC73fQ==',
      });
      context.meta.authorization = `Bearer ${loginInfo.data.access_token}`;

      const result = await context.call('auth.authWebhook');

      expect(result).toMatchObject({
        'X-Hasura-Role': 'public',
        'X-Hasura-User-Id': loginInfo.data.user.id.toString(),
      });
    });

    it('should authenticate with admin fail', async () => {
      context.meta.authorization = '';
      const result = await context.call('auth.authWebhook');

      expect(result).toMatchObject({
        'X-Hasura-Role': 'public',
      });
    });

    it('should authenticate with admin fail when invalid token', async () => {
      const { token } = AdminUser.generateToken({ id: '', role: 'ADMIN' });
      context.meta.authorization = `Bearer ${token.accessToken}`;
      const result = context.call('auth.authWebhook');

      await expect(result).rejects.toThrow(AuthenticationError);
    });

    it('should authenticate with public role with user token', async () => {
      const token = TokenHandler.generateJWT({ id: 1 });
      context.meta.authorization = `Bearer ${token.accessToken}`;
      const result = await context.call('auth.authWebhook');

      expect(result).toMatchObject({
        'X-Hasura-Role': 'public',
      });
    });
  });

  describe('Test GET /logout', () => {
    it('Logout success', async () => {
      // setup.
      const loginResponse = await context.call('auth.login', {
        data: '1659496276785',
        pubkey: 'A4ALmwgw/hIubQD7ZYu0cnL1WXycXN+ONujVxSY2nHCp',
        signature: 'NF2WvijnaR0Xcyh7GDCK6/tuvBLftnjpWAMaZa/xta4J/uku/OIr448OsKnyIR7VmcfClL/9KA3WChsQuC73fQ==',
      });

      const userId = loginResponse.data.user.id;
      const fcmToken = 'fcm token';
      await UserDeviceToken.query().insert({ user_id: userId, fcm_token: fcmToken });

      // execute.
      const token = loginResponse.data.access_token;
      const result = await context.call('auth.logout', { token: `Bearer ${token}`, fcm_token: fcmToken });

      // verify.
      expect(result).toMatchObject({ message: 'logout-successfully' });

      const jwt = await Jwt.query().where({ user_id: userId }).first();
      expect(_.isEmpty(jwt.deleted_at)).toBeTruthy();

      const userDevices = await UserDeviceToken.query().where({
        user_id: loginResponse.data.user.id,
        fcm_token: fcmToken,
      });
      expect(userDevices.length).toBe(0);
    });
  });
});
