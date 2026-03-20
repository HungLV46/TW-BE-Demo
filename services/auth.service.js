'use strict';

const { MoleculerClientError } = require('moleculer').Errors;

const Jwt = require('../app/models/jwt');
const { User, UserDeviceToken } = require('@models');
const { TokenHandler } = require('../app/helpers/jwt-token');
const { ValidationError, AuthenticationError } = require('@helpers/errors');
const chainConfig = require('@config/chain').defaultChain;
const config = require('@config/config');
const ggClient = require('@helpers/google-oauth2-client');
const { AdminUser } = require('@models');

const { sha256, Secp256k1, Secp256k1Signature } = require('@cosmjs/crypto');
const { encodeSecp256k1Pubkey, pubkeyToAddress, serializeSignDoc } = require('@cosmjs/amino');
const { fromBase64 } = require('@cosmjs/encoding');
const { get } = require('lodash');

module.exports = {
  name: 'auth',
  mixins: [],
  /**
   * Service settings
   */
  settings: {
    /** Secret for JWT */
    JWT_SECRET: process.env.JWT_SECRET || 'jwt-conduit-secret',
  },

  /**
   * Service dependencies
   */
  // dependencies: [],

  /**
   * Actions
   */
  actions: {
    /**
     *  Login with pubkey and signature
     *  use: Users
     *  data: "1659496276785"
     *  pubkey: "A4ALmwgw/hIubQD7ZYu0cnL1WXycXN+ONujVxSY2nHCp"
     *  signature: "NF2WvijnaR0Xcyh7GDCK6/tuvBLftnjpWAMaZa/xta4J/uku/OIr448OsKnyIR7VmcfClL/9KA3WChsQuC73fQ=="
     */
    login: {
      visibility: 'published',
      openapi: {
        summary: 'Login with wallet',
      },
      params: {
        data: 'string|min:1',
        signature: 'string|min:1',
        pubkey: 'string|min:1',
        $$strict: true,
      },
      async handler(ctx) {
        const params = ctx.params;
        const pubkeyFormated = encodeSecp256k1Pubkey(fromBase64(params.pubkey));
        const address = pubkeyToAddress(pubkeyFormated, chainConfig.prefix).toLowerCase();

        // create message hash from data
        const msg = this.createSignMessageByData(address, params.data);
        const msgHash = sha256(serializeSignDoc(msg));
        const pubKeyUint8 = fromBase64(params.pubkey);

        // verify signature
        const resultVerify = await Secp256k1.verifySignature(
          Secp256k1Signature.fromFixedLength(fromBase64(params.signature)),
          msgHash,
          pubKeyUint8,
        );

        if (!resultVerify) {
          throw new ValidationError('invalid-signature');
        }
        return User.query()
          .select('*')
          .where('aura_address', address)
          .first()
          .then((user) => {
            if (user === undefined) {
              return User.query()
                .insert({
                  aura_address: address,
                })
                .returning(User.selectableProps)
                .then((_user) => {
                  return this.login(_user);
                });
            }
            return this.login(user);
          });
      },
    },
    /**
     * Verify user token & return user info
     * use: ApiGateway
     */
    verifyToken: {
      visibility: 'public',
      params: {
        token: 'string|min:1',
      },
      async handler(ctx) {
        const token = TokenHandler.validateToken(ctx.params.token);
        const jwt = await Jwt.query().findOne({ jti: token.body.jti });

        if (!jwt) return undefined;

        const user = await User.query().select(User.selectableProps).findOne({ id: jwt.user_id });

        return { jti: jwt.jti, ...user };
      },
    },

    logout: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      params: {
        token: { type: 'string' },
        fcm_token: { type: 'string', optional: true },
        $$strict: true,
      },
      async handler(ctx) {
        const token = TokenHandler.validateToken(ctx.params.token);
        const jwt = await Jwt.query().findOne({ jti: token.body.jti });
        if (!jwt) {
          return { message: 'logout-successfully' };
        }

        await Jwt.logout(jwt);

        const fcmToken = ctx.params.fcm_token;
        if (fcmToken) {
          await UserDeviceToken.query().where({ user_id: jwt.user_id, fcm_token: fcmToken }).delete();
        }

        this.broker.emit('user.logout', { token: ctx.params.token }, ['api']);
        return { message: 'logout-successfully' };
      },
    },

    /**
     *  auth webhook
     */
    authWebhook: {
      visibility: 'published',
      async handler(ctx) {
        const token = ctx.meta.authorization;

        if (token) {
          const jwtDecoded = TokenHandler.validateToken(token);
          const hasuraClaims = get(jwtDecoded, 'body.hasura');
          if (hasuraClaims) {
            const userRole = hasuraClaims['default-role'] || '';
            const userId = hasuraClaims['user-id'];

            if (!userRole || !userId) {
              throw new AuthenticationError('Authorization Failure');
            }

            // TODO: we will return 'admin', which will have full permission of Hasura
            // will need to find a way to limit permision
            if (userRole.includes('admin')) {
              const admin = await AdminUser.query().findById(userId);

              return {
                'X-Hasura-User-Id': admin.id.toString(),
                'X-Hasura-Role': admin.role,
              };
            }

            // consider other role to be user.
            const user = await User.query().findById(userId);
            return {
              'X-Hasura-User-Id': user.id.toString(),
              'X-Hasura-Role': 'public',
            };
          }
        }

        return { 'X-Hasura-Role': 'public' };
      },
    },

    /**
     *  Admin login with google
     *  idToken: "<token>"
     */
    adminLogin: {
      visibility: 'published',
      params: {
        idToken: 'string|min:1',
        $$strict: true,
      },
      async handler(ctx) {
        const params = ctx.params;

        try {
          const resp = await ggClient.verifyIdToken({
            idToken: params.idToken,
            audience: config.GOOGLE_CLIENT_ID,
          });
          const {
            name, email, picture, sub
          } = resp.getPayload();

          const user = await AdminUser.query().select(AdminUser.selectableProps).findOne({ email }).throwIfNotFound();

          const updateUser = {
            name,
            avatar: picture,
            google_id: sub,
          };
          await AdminUser.query().patch(updateUser).where('id', user.id);

          const token = AdminUser.generateToken({ ...user, ...updateUser });
          return this.transformLogin(token);
        } catch (e) {
          this.logger.error(e);
          throw new MoleculerClientError('unexpected-error', 500, '', []);
        }
      },
    },
    /**
     * Verify admin token & return user info
     */
    verifyAdminToken: {
      visibility: 'public',
      params: {
        token: 'string|min:1',
      },
      async handler(ctx) {
        const token = TokenHandler.validateToken(ctx.params.token);

        const adminUser = await AdminUser.query()
          .select(AdminUser.selectableProps)
          .findOne({ id: token.body.sub })
          .throwIfNotFound();

        return { jti: token.body.jti, ...adminUser };
      },
    },
  },
  methods: {
    async login(user) {
      const token = User.generateToken(user);
      await Jwt.query().insert({ jti: token.token.jti, user_id: user.id });

      return this.transformLogin(token);
    },
    transformLogin(data) {
      return {
        data: {
          token_type: 'Bearer',
          access_token: data.token.accessToken,
          refresh_token: data.token.refreshToken,
          user: data.user,
        },
      };
    },
    createSignMessageByData(address, data) {
      const signDoc = {
        chain_id: '',
        account_number: '0',
        sequence: '0',
        fee: {
          gas: '0',
          amount: [],
        },
        msgs: [
          {
            type: 'sign/MsgSignData',
            value: {
              signer: address,
              data: Buffer.from(data, 'utf8').toString('base64'),
            },
          },
        ],
        memo: '',
      };
      return signDoc;
    },
  },
  /**
   * Events
   */
  events: {
    // Handling event
  },
  /**
   * Service created lifecycle event handler
   */
  created() {},
  /**
   * Service started lifecycle event handler
   */
  started() {},

  /**
   * Service stopped lifecycle event handler
   */
  stopped() {},
};
