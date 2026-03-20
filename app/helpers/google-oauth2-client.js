const config = require('@config/config');
const { OAuth2Client } = require('google-auth-library');

const ggClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);
module.exports = ggClient;
