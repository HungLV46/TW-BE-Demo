/* eslint-disable no-underscore-dangle */

'use strict';

const { I18n } = require('i18n');
const i18n = new I18n();
const path = require('path');
const ApiGateway = require('moleculer-web');
const BullBoard = require('../mixins/bull-board');
const { AuthenticationError } = require('@helpers/errors');

module.exports = {
  name: 'api',
  mixins: [ApiGateway, BullBoard],
  settings: {
    port: process.env.PORT || 3000,
    rateLimit: {
      // How long to keep record of requests in memory (in milliseconds).
      // Defaults to 60000 (1 min)
      window: 60 * 1000,

      // Max number of requests during window. Defaults to 30
      limit: process.env.RATE_LIMIT || 100,

      // Set rate limit headers to response. Defaults to false
      headers: true,

      // Function used to generate keys. Defaults to:
      key: (req) => {
        let data = req.headers['x-forwarded-for']
          || req.connection.remoteAddress
          || req.socket.remoteAddress
          || req.connection.socket.remoteAddress;
        if (req.headers.authorization) return req.headers.authorization;
        return data;
      },
      // StoreFactory: CustomStore
    },
    cors: {
      // Configures the Access-Control-Allow-Origin CORS header.
      origin: '*',
      // Configures the Access-Control-Allow-Methods CORS header.
      methods: ['GET', 'OPTIONS', 'POST', 'PUT', 'DELETE', 'PATCH'],
      // Configures the Access-Control-Allow-Headers CORS header.
      credentials: false,
      // Configures the Access-Control-Max-Age CORS header.
      maxAge: 3600,
    },
    path: '/',
    routes: [
      // moleculer-auto-openapi routes
      {
        path: '/openapi',
        aliases: {
          'GET /openapi.json': 'openapi.generateDocs', // swagger scheme
          'GET /ui': 'openapi.ui', // ui
        },
      },
      {
        path: '/public',
        authorization: false,
        mappingPolicy: 'restrict',
        mergeParams: true,
        aliases: {
          /*
           @login
           Resolve both login and register
          */
          'POST login': 'auth.login',

          'POST /collections/:contract_address/resync/:token_id': 'nft.resync',

          'POST /collections/:contract_address/nfts-search': 'search.search',

          'GET /marketplace/config': 'marketplace.config',
        },
        bodyParsers: {
          json: true,
        },
      },
      {
        path: '/',
        authorization: true,
        mappingPolicy: 'restrict',
        mergeParams: true,
        use: [],
        cors: {
          origin: '*',
          methods: ['GET', 'OPTIONS', 'POST', 'PUT', 'DELETE', 'PATCH'],
          credentials: true,
        },
        aliases: {
          /**
           * user
           */
          'POST logout': 'auth.logout',
          'GET /me': 'user.me',
          'GET /users/:address': 'user.show',
          'POST /me': 'user.update',

          /**
           * collection
           */
          'PATCH /collections/:contract_address': 'collection.patch',
          'PATCH /collections/:contract_address/update_authorization': 'collection.updateAuthorization',
          'PATCH /collections/:contract_address/update_social_link': 'collection.updateSocialLink',
          'DELETE /collections/:contract_address/remove_social_link': 'collection.removeSocialLink',

          /**
           * notification
           */
          'POST /notifications/register': 'notification.registerFcmToken',
        },
        bodyParsers: {
          json: true,
        },
        onBeforeCall(ctx, route, req, res) {
          ctx.meta.clientIp = req.headers['x-forwarded-for']
            || req.connection.remoteAddress
            || req.socket.remoteAddress
            || req.connection.socket.remoteAddress;
        },
        onAfterCall(ctx, route, req, res, data) {
          if (data && data.message && data.message.length > 0) {
            i18n.configure({
              defaultLocale: 'en',
              header: 'accept-language',
              locales: ['vi', 'en'],
              directory: path.join(__dirname, '../locales'),
            });
            i18n.init(req, res);
            // eslint-disable-next-line no-param-reassign
            data.message = res.__(data.message);
          }
          return data;
        },
      },
      {
        cors: {
          origin: '*',
          methods: ['GET', 'OPTIONS', 'POST', 'PUT'],
          credentials: true,
        },
        path: '/upload',

        // You should disable body parsers
        bodyParsers: {
          json: false,
          urlencoded: false,
        },
        authorization: true,
        aliases: {
          // File upload from HTML form
          'POST /photos': 'multipart:file.save',
          'POST /ipfs/photos': 'multipart:file.ipfs_save',
        },

        // https://github.com/mscdex/busboy#busboy-methods
        busboyConfig: {
          limits: {
            files: 1,
            fileSize: 10000000,
          },
        },

        mappingPolicy: 'restrict',
      },
      {
        path: '/auth-webhook',
        mappingPolicy: 'restrict',
        aliases: {
          'GET ': 'auth.authWebhook',
        },
        bodyParsers: {
          json: true,
        },
        onBeforeCall(ctx, route, req) {
          ctx.meta.authorization = req.headers.authorization;
        },
      },
      {
        path: '/admin/login',
        authorization: false,
        mappingPolicy: 'restrict',
        mergeParams: true,
        aliases: {
          'POST ': 'auth.adminLogin',
        },
        bodyParsers: {
          json: true,
        },
      },
      {
        path: '/admin',
        authorization: true,
        aliases: {
          'POST /upload/photos': 'multipart:file.save',
        },
        cors: {
          origin: '*',
          methods: ['GET', 'OPTIONS', 'POST', 'PUT'],
          credentials: true,
        },
        bodyParsers: {
          json: false,
          urlencoded: false,
        },
        busboyConfig: {
          limits: {
            files: 1,
            fileSize: 104857600, // 100MB
          },
        },

        mappingPolicy: 'restrict',
      },
      {
        path: '/admin',
        authorization: true,
        aliases: {
          'POST /launchpad/deploy': 'launchpad.deploy',
          'POST /launchpad/add_mint_phases_and_whitelists': 'launchpad.add_mint_phases_and_whitelists',
          'POST /launchpad/activate': 'launchpad.activate',
          'POST /launchpad/deactivate': 'launchpad.deactivate',
          'POST /launchpad/publish': 'launchpad.publish',
          'POST /launchpad/unpublish': 'launchpad.unpublish',

          'POST /collections/:contract_address/resync': 'collection.resync',
          'POST /collections/:contract_address/update_metadata': 'sync-data.updateCollectionMetadataByContractAddress',
        },
        cors: {
          origin: '*',
          methods: ['GET', 'OPTIONS', 'POST', 'PUT'],
          credentials: true,
        },
        bodyParsers: {
          json: true,
          urlencoded: false,
        },
        callOptions: {
          timeout: 60000,
        },
        mappingPolicy: 'restrict',
      },
    ],
    onError(req, res, err) {
      i18n.configure({
        defaultLocale: 'en',
        header: 'accept-language',
        locales: ['vi', 'en'],
        directory: path.join(__dirname, '../locales'),
      });
      i18n.init(req, res);
      let code = err.code;
      let message = err.message;
      switch (true) {
        case err.code === 404:
          if (err.type === 'SERVICE_NOT_AVAILABLE') {
            code = 500;
            message = 'SERVICE_NOT_AVAILABLE';
          }
          break;
        case err.code === 422:
          try {
            if ((err.data || []).length > 0) {
              message = err.data[0].message;
            } else {
              message = err.message;
            }
          } catch (error) {
            this.logger.error(error);
            message = 'Parameters validation error!';
          }
          break;
        case err.code < 500:
          message = err.message;
          break;
        default:
          code = 500;
          message = 'internal-server-error';
          break;
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(code);
      res.end(
        JSON.stringify({
          code: code,
          data: err.data,
          message: res.__(message),
        }),
      );
    },
    // Serve assets from "public" folder
    assets: {
      folder: 'public',
      options: {
        setHeaders: function setHeaders(res) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET');
        },
      },
    },
    acceptedLanguages: ['vi', 'en'],
    defaultLanguage: 'vi',
  },

  methods: {
    async authorize(ctx, _route, req) {
      let auth = req.headers.authorization;
      const isAdminPath = req.baseUrl === '/admin';

      let acceptLanguage = req.headers['accept-language'];
      if (!this.settings.acceptedLanguages.includes(acceptLanguage)) {
        acceptLanguage = this.settings.defaultLanguage;
      }
      ctx.meta.acceptLanguage = acceptLanguage;

      if (auth && auth.startsWith('Bearer')) {
        let user = await this.broker.cacher.get(auth);
        if (user === null) {
          user = isAdminPath
            ? await this.broker.call('auth.verifyAdminToken', { token: auth })
            : await this.broker.call('auth.verifyToken', { token: auth });
          if (user === undefined) {
            return Promise.reject(new AuthenticationError('Authorization Failure'));
          }
          await this.broker.cacher.set(auth, user, 3600);
          // hset map
        } else {
          await this.broker.cacher.set(auth, user, 3600);
        }
        ctx.meta.user = user;
        return Promise.resolve(ctx);
      }

      // No token
      return Promise.reject(new AuthenticationError('Authorization Failure'));
    },
  },

  events: {},
};
