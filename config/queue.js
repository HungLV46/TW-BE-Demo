'use strict';

module.exports = {
  QueueConfig: {
    url: process.env.CACHER || 'redis://localhost:6379',
    opts: {
      prefix: 'twilight-bull-' + (process.env.DEPLOY_NAMESPACE || 'local'),
    },
  },
};
