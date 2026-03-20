'use strict';

const QueueService = require('moleculer-bull');
const { QueueConfig } = require('@config/queue');
const { NftHistory, UserDeviceToken, Notification } = require('@models');
const firebaseAdmin = require('firebase-admin');
const _ = require('lodash');

module.exports = {
  name: 'notification',
  mixins: [QueueService(QueueConfig.url, QueueConfig.opts)],

  settings: {
    firebase: {},
  },

  queues: {
    /**
     * Send notification to device
     *
     * Supported cases:
     *  - send: send 1 message to 1 user
     *  - send all: send many massages to multiple users (1 message per user)
     *  - send multicast: send 1 message to multiple users
     *
     * This function DOES NOT SUPPORT a combination of send all & send multicast
     *
     * job.data
     *      @notifications : array of notification
     */
    'notification.send': {
      concurrency: 1,
      async process(job) {
        return this.processNotifications(job.data);
      },
    },
  },

  actions: {
    list: {
      params: {
        $$strict: true,
      },
      async handler(ctx) {
        return NftHistory.query()
          .select(NftHistory.selectableProps)
          .where({ user_id: ctx.meta.user.id })
          .whereIn('event', ['buy', 'offer'])
          .orderBy('created_at', 'desc')
          .withGraphFetched('actor.profile_picture')
          .page(ctx.params.current_page, ctx.params.records_per_page);
      },
    },

    registerFcmToken: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      params: {
        // device_id: 'string|convert|min:1',
        fcm_token: 'string|min:1',
        // os: 'string|optional',
        // os_version: 'string|optional',
        // device_model: 'string|optional',
        $$strict: true,
      },
      async handler(ctx) {
        // TODO: handle multiple devices
        return UserDeviceToken.query()
          .insert({
            ...ctx.params,
            user_id: ctx.meta.user.id,
          })
          .onConflict(['user_id', 'fcm_token'])
          .ignore()
          .returning(UserDeviceToken.selectableProps)
          .then((data) => {
            return {
              data: data,
            };
          });
      },
    },

    push: {
      params: {
        notifications: 'array',
        $$strict: true,
      },
      visibility: 'protected',
      async handler(ctx) {
        // we will call immediately in case of testing
        if (process.env.NODE_ENV === 'test') {
          return this.processNotifications(ctx.params);
        }
        return this.createJob('notification.send', ctx.params, { removeOnFail: 100 });
      },
    },
  },

  /**
   * Methods
   */
  methods: {
    // This function queries DB multiple times depended on data.notifications's length.
    // but in its actual use-cases, data.notifications is always less than or equal to 2
    // so it will not cause significant performance issue
    async processNotifications(data) {
      // update DB
      const validNotifications = data.notifications.filter((notification) =>
        !_.isEmpty(notification.receivers));

      if (_.isEmpty(validNotifications)) return true;

      const notifications = await Notification.query().insertGraph(validNotifications).returning('id');

      for (let i = 0; i < notifications.length; i += 1) {
        notifications[i].content.data.notification_id = notifications[i].id.toString();
      }

      const firebaseMessagingPromises = notifications.map((notification) =>
        this.sendMulticast(notification));
      await Promise.all(firebaseMessagingPromises);

      return true;
    },

    async sendMulticast(notification) {
      const userIds = notification.receivers.map((userNoti) =>
        userNoti.user_id);
      const deviceTokens = await UserDeviceToken.query().whereIn('user_id', userIds);

      if (_.isEmpty(deviceTokens)) return Promise.resolve();

      return firebaseAdmin
        .messaging()
        .sendMulticast({
          data: notification.content.data,
          notification: notification.content.notification,
          tokens: deviceTokens.map((token) =>
            token.fcm_token),
        })
        .catch((error) =>
          this.logger.error('cannot-send-multiple-notfitication', error));
    },
  },

  /**
   * Service created lifecycle event handler
   */
  created() {},

  /**
   * Service started lifecycle event handler
   */
  async started() {
    if (process.env.NODE_ENV !== 'test') {
      await this.waitForServices(['api']);
      await this.broker.call('api.add_queue', { queue_name: 'notification.send' });
      // initializeApp function only can be called once so hot load doesn't work.
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
          project_id: process.env.FCM_PROJECT_ID,
          private_key: Buffer.from(process.env.FCM_PRIVATE_KEY, 'base64').toString('ascii'),
          client_email: process.env.FCM_CLIENT_EMAIL,
        }),
      });
    }
  },

  /**
   * Service stopped lifecycle event handler
   */
  stopped() {},
};
