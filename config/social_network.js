'use strict';

// setting for discord
const DISCORD_API_ENDPOINT = 'https://discord.com/api';
const discord = {
  // OAuth2 framework settings
  access_token_request_grant_type: 'authorization_code',
  refresh_token_request_grant_type: 'refresh_token',

  // Discord APIs
  endpoint_token: `${DISCORD_API_ENDPOINT}/oauth2/token`,
  endpoint_identify: `${DISCORD_API_ENDPOINT}/users/@me`,
  endpoint_guilds: `${DISCORD_API_ENDPOINT}/users/@me/guilds`,
  endpoint_guilds_members_read: (guildId) =>
    `${DISCORD_API_ENDPOINT}/users/@me/guilds/${guildId}/member`,
  endpoint_invite_link_info: (inviteCode) =>
    `${DISCORD_API_ENDPOINT}/invites/${inviteCode}`,

  // Discord setting for API calls
  header_content_type: 'application/x-www-form-urlencoded',

  // Discord application settings
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || '',
  REDIRECT_URI: process.env.DISCORD_REDIRECT_URI || '',

  invite_link_prefix: 'https://discord.gg/',
  oauth2_verification_scopes: ['guilds', 'identify', 'guilds.members.read'],
};

// setting for twitter
const twitter = {
  pkce_code_challenge_method: 'plain',

  // Twitter application settings
  BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || '',
  CLIENT_ID: process.env.TWITTER_CLIENT_ID || '',
  CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET || '',
  REDIRECT_URL: process.env.TWITTER_REDIRECT_URL || '',

  // Scopes: https://developer.twitter.com/en/docs/authentication/oauth-2-0/authorization-code
  oauth2_verification_scopes: ['tweet.read', 'users.read', 'follows.read', 'mute.read', 'mute.read', 'block.read'],

  profile_link: (username) =>
    `https://twitter.com/${username}`,
};

// settings for telegram client.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const telegram = {
  BOT_TOKEN: TELEGRAM_BOT_TOKEN,

  // https://core.telegram.org/bots/api#making-requests
  telegram_request_url: (methodName) =>
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${methodName}`,

  invite_link_prefix: 'https://t.me/',
};

module.exports = {
  discord,
  twitter,
  telegram,
};
