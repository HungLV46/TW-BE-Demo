'use strict';

const axios = require('axios').default;
const querystring = require('qs');
const settings = require('@config/social_network');

const { ValidationError } = require('@helpers/errors');

/**
 * helper functions to interact with discord's APIs
 * https://discord.com/developers/docs/topics/oauth2
 */
class DiscordClient {
  constructor() {
    this.settings = settings.discord;
  }

  async verifyInviteLink(accessToken, inviteLink) {
    // verify discord link is set to never expire
    const inviteInfo = await this.getInviteInfo(inviteLink);
    if (inviteInfo.expires_at) throw new ValidationError('Invite link needs to be set to never expire!');

    const allServersOfUser = await this.getGuildsInfo(accessToken);
    const serverInvitedTo = allServersOfUser.filter((guild) =>
      guild.id === inviteInfo.guild.id)[0];
    // verify user is in the server
    if (!serverInvitedTo) {
      throw new ValidationError('User is not in the discord server!');
    }
    // verify user has admin permission in the server
    if (!serverInvitedTo.owner && !this.constructor.checkContainsAdminPermission(serverInvitedTo.permissions_new)) {
      throw new ValidationError('User must be owner/admin of the server!');
    }

    // create validation success response
    const userInfo = await this.getUserInfo(accessToken);
    return { username: userInfo.username, guild_name: inviteInfo.guild.name };
  }

  async verifyAuthorizationInfo(authorizationCode) {
    const authorization = await this.exchangeAccessToken(authorizationCode);
    this.verifyValidationScope(authorization.scope);
    return { authorization_info: authorization };
  }

  exchangeAccessToken(authenticationCode) {
    if (!authenticationCode) throw new ValidationError('Missing "authorization code"!');

    const data = querystring.stringify({
      client_id: this.settings.CLIENT_ID,
      client_secret: this.settings.CLIENT_SECRET,
      grant_type: this.settings.access_token_request_grant_type,
      code: authenticationCode,
      redirect_uri: this.settings.REDIRECT_URI,
    });

    const headers = { 'Content-Type': this.settings.header_content_type };

    return axios
      .post(this.settings.endpoint_token, data, { headers })
      .then((response) =>
        response.data)
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.response.data, null, 2));
      });
  }

  /**
   * Check scope of an authorization code can be used for verification.
   *
   * @param {*} scopesString each scope in scopesString is seperated by a space (' ')
   * @returns true if valid else throw exception
   */
  verifyValidationScope(scopesString) {
    if (!scopesString) throw new ValidationError('Scopes are missing!');

    const scopes = scopesString.split(' ');

    // all scopes in setting are in scopesString
    const validScope = this.settings.oauth2_verification_scopes.every((verificationScope) =>
      scopes.includes(verificationScope));

    if (!validScope) throw new ValidationError("Authorization code doesn't have enough enough scope for verifying social link!");
  }

  refreshAccessToken(refreshToken) {
    if (!refreshToken) throw new ValidationError('Missing "refresh token"!');

    const data = querystring.stringify({
      client_id: this.settings.CLIENT_ID,
      client_secret: this.settings.CLIENT_SECRET,
      grant_type: this.settings.refresh_token_request_grant_type,
      refresh_token: refreshToken,
    });
    const headers = { 'Content-Type': this.settings.header_content_type };

    return axios
      .post(this.settings.endpoint_token, data, { headers })
      .then((response) =>
        response.data)
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.response.data, null, 2));
      });
  }

  getInviteInfo(inviteLink) {
    if (!inviteLink) throw new ValidationError('Missing "invite link"!');

    // validate the link
    if (!inviteLink.startsWith(this.settings.invite_link_prefix)) throw new ValidationError('Invalid invite link!');

    // extract invite code
    const inviteCode = inviteLink.slice(this.settings.invite_link_prefix.length);

    return axios
      .get(this.settings.endpoint_invite_link_info(inviteCode))
      .then((response) =>
        response.data)
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.response.data, null, 2));
      });
  }

  getUserInfo(accessToken) {
    if (!accessToken) throw new ValidationError('Missing "access token"!');

    return axios
      .get(this.settings.endpoint_identify, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then((response) =>
        response.data)
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.response.data, null, 2));
      });
  }

  getGuildsInfo(accessToken) {
    if (!accessToken) throw new ValidationError('Missing "access token"!');

    return axios
      .get(this.settings.endpoint_guilds, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then((response) =>
        response.data)
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.response.data, null, 2));
      });
  }

  getGuildMemberInfo(accessToken, guildId) {
    if (!accessToken || !guildId) throw new ValidationError('Missing "access token" or "guild ID"!');

    return axios
      .get(this.settings.endpoint_guilds_members_read(guildId), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then((response) =>
        response.data)
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.response.data, null, 2));
      });
  }

  /**
   * https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
   *
   * The total permissions integer can be determined by OR-ing (|) together each individual value
   * Bitwise value representing Administrator is: 0x0000000000000008 (1 << 3)
   * @param {*} totalPermission
   * @returns true: total permission contains admin role, otherwise return false
   */
  static checkContainsAdminPermission(totalPermission) {
    return (
      totalPermission !== undefined
      // eslint-disable-next-line no-bitwise, no-undef
      && (BigInt(totalPermission) & BigInt(8)) !== BigInt(0)
    ); // check bit at position 3 is set
  }
}

module.exports = DiscordClient;
