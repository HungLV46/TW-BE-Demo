'use strict';

const { User } = require('@models');
const { ValidationError } = require('@helpers/errors');
const _ = require('lodash');

module.exports = {
  name: 'user',

  /**
   * Default settings.
   */
  settings: {},

  /**
   * Users APIs.
   */
  actions: {
    /**
     * Get info of current user
     * Auth is required!
     */
    me: {
      openapi: {
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Get user success.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'number' },
                        aura_address: { type: 'string' },
                        name: { type: 'string' },
                        avatar: { type: 'string' },
                        created_at: { type: 'timestamp' },
                        updated_at: { type: 'timestamp' },
                      },
                    },
                  },
                  example: {
                    data: {
                      id: 51,
                      aura_address: 'aura1au5kde4luz8tdtm4ral36ln2fnzwd07gysjazj',
                      name: 'Xander_Lind',
                      avatar: 'https://loremflickr.com/200/200/people?lock=38725',
                      created_at: '2022-08-24T20:56:11.000Z',
                      updated_at: '2022-08-24T20:56:11.000Z',
                    },
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/AuthorizationFailure',
          },
          404: {
            $ref: '#/components/responses/NotFound',
          },
          422: {
            $ref: '#/components/responses/InvalidRequest',
          },
          default: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
      handler(ctx) {
        return User.query()
          .select(User.selectableProps)
          .findOne({ id: ctx.meta.user.id })
          .whereNotDeleted()
          .throwIfNotFound('User not found!')
          .then((user) =>
            this.formatResponse(user));
      },
    },

    /**
     * Get info of other user
     * Auth is required!
     */
    show: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      params: {
        address: { type: 'string' },
      },
      handler(ctx) {
        return User.query()
          .select(User.selectableProps)
          .findOne({ aura_address: ctx.params.address })
          .whereNotDeleted()
          .throwIfNotFound('User not found!')
          .then((user) =>
            this.formatResponse(user));
      },
    },

    /**
     * Update current user.
     * Auth is required!
     */
    update: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      params: {
        name: 'string|optional|min:1|max:255',
        avatar: 'string|optional|min:1|max:2000',
        cover_picture: 'string|optional|min:1|max:2000',
        $$strict: true,
      },
      handler(ctx) {
        if (_.isEmpty(ctx.params)) {
          throw new ValidationError('Request is empty, please specify at least one attribute to update!');
        }
        return User.query().findById(ctx.meta.user.id).throwIfNotFound('User not found!').patch(ctx.params);
      },
    },
  },

  methods: {
    formatResponse(response) {
      return { data: response };
    },
  },
};
