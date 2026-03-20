'use strict';

const QueueService = require('moleculer-bull');
const queueConfig = require('@config/queue').QueueConfig;
const { Offer } = require('@models');

module.exports = {
  name: 'sync-offer',
  mixins: [QueueService(queueConfig.url, queueConfig.opts)],
  settings: {},

  queues: {
    'sync.offer-expiration': {
      concurrency: 1,
      async process(job) {
        return this.updateOfferExpiration(job.data);
      },
    },
  },

  // TODO handle when expiration is by block height
  methods: {
    async updateOfferExpiration() {
      // update all offers with end_date < now
      return Offer.query()
        .where({ status: Offer.STATUSES.ONGOING })
        .where('end_time', '<', new Date())
        .patch({ status: Offer.STATUSES.ENDED })
        .returning('id');
    },
  },

  async started() {
    if (process.env.NODE_ENV !== 'test') {
      // we will check for offer expiration every 30 seconds, this should be enough as the main check is on contract
      await this.createJob(
        'sync.offer-expiration',
        {},
        { repeat: { every: 30000 }, removeOnComplete: 10, removeOnFail: 100 },
      );
      await this.waitForServices(['api']);
      await this.broker.call('api.add_queue', { queue_name: 'sync.offer-expiration' });
    }
  },

  async stopped() {
    await this.getQueue('sync.offer-expiration').close();
  },
};
