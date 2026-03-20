const Openapi = require('moleculer-auto-openapi');

module.exports = {
  name: 'openapi',
  mixins: [Openapi],
  settings: {
    // all setting optional
    openapi: {
      info: {
        // about project
        description: 'Easy APIs for NFT business in Aura Network',
        title: 'Twilight API',
        version: '0.1',
      },
      tags: [
        // you tags
        // { name: "auth", description: "My custom name" },
      ],
      components: {
        // you auth
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },

        responses: {
          AuthorizationFailure: {
            description: 'Authorization Failure.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  example: {
                    code: 401,
                    data: [],
                    message: 'Authorization Failure',
                  },
                },
              },
            },
          },
          NotFound: {
            description: 'The resource was not found.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  example: {
                    code: 404,
                    message: 'Resource not found!',
                  },
                },
              },
            },
          },
          InvalidRequest: {
            description: 'Request validation failed.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  example: {
                    code: 422,
                    data: [
                      {
                        type: 'stringPattern',
                        message: "The 'subdomain' field fails to match the required pattern.",
                        field: 'subdomain',
                        expected: '/^[a-z0-9]+$/',
                        actual: '$',
                        nodeID: 'cpphunglv46-16452',
                        action: 'store.register',
                      },
                    ],
                    message: "The 'subdomain' field fails to match the required pattern.",
                  },
                },
              },
            },
          },
          ServerError: {
            description: 'Server errors: 500, 501, 400, 404 and etc...',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  example: {
                    code: 500,
                    message: 'internal-server-error',
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  actions: {
    ui: {
      params: {
        url: { $$t: 'Schema url', type: 'string', optional: true },
      },
      handler(ctx) {
        ctx.meta.$responseType = 'text/html; charset=utf-8';

        return `
        <!doctype html> <!-- Important: must specify -->
        <html>
        <head>
          <meta charset="utf-8"> <!-- Important: rapi-doc uses utf8 characters -->
          <script type="module" src="https://unpkg.com/rapidoc/dist/rapidoc-min.js"></script>
        </head>
        <body>
          <rapi-doc 
            spec-url = "/openapi/openapi.json" 
          > </rapi-doc>
        </body> 
        </html>`;
      },
    },
  },
};
