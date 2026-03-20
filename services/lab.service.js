const Laboratory = require('@moleculer/lab');

module.exports = {
  mixins: [Laboratory.AgentService],
  settings: {
    token: 'lab-secret-token-aokd82m3',
    apiKey: process.env.LAB_API_KEY,
  },
};
