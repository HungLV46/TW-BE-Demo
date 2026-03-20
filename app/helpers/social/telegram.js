'use strict';

const axios = require('axios').default;

const crypto = require('crypto');
const { ValidationError } = require('@helpers/errors.js');
const settings = require('@config/social_network.js');

const _ = require('lodash');

/**
 * This client is for Authorizing the telegram account.
 */
class TelegramClient {
  constructor() {
    this.settings = settings.telegram;
  }

  async verifyInviteLink(authorization, inviteLink) {
    const administrators = await this.getInvitedChatAdministrators(inviteLink);

    // verify user is one of administrators of group
    for (let i = 0; i < administrators.length; i += 1) {
      if (administrators[i].user.id === authorization.id) return;
    }

    throw new ValidationError('User is not administrator of the group/channel!');
  }

  /**
   * Verify authorization and intergration of authorization info
   * Following guideline and example in links bellow:
   *   https://core.telegram.org/widgets/login#checking-authorization
   *   https://core.telegram.org/widgets/login#sample-implementation
   */
  verifyAuthorizationInfo(authorization) {
    if (_.isEmpty(authorization)) throw new ValidationError('Missing authorization data!');

    const userInfo = { ...authorization };
    delete userInfo.hash;

    const key = crypto.createHash('sha256').update(this.settings.BOT_TOKEN).digest();
    const message = Object.keys(userInfo)
      .map((k) =>
        `${k}=${userInfo[k]}`)
      .sort()
      .join('\n');
    const hash = crypto.createHmac('sha256', key).update(message).digest('hex');

    if (hash !== authorization.hash) {
      throw new ValidationError('Data is not from Telegram!');
    }

    if (Date.now() / 1000 - authorization.auth_date > 86400) {
      // authorization date must be within the past 24h
      throw new ValidationError('Telegram authorization data is outdated!');
    }

    return { authorization_info: authorization };
  }

  /**
   * Get list of administrators (which aren't bot) of public group/channel (to which you will be invited to).
   */
  getInvitedChatAdministrators(inviteLink) {
    if (!inviteLink) throw new ValidationError('Missing "invite link"!');

    // validate the link
    if (!inviteLink.startsWith(this.settings.invite_link_prefix)) throw new ValidationError('Invalid invite link!');

    const username = inviteLink.slice(this.settings.invite_link_prefix.length);

    // https://core.telegram.org/bots/api#getchatadministrators
    return axios
      .get(this.settings.telegram_request_url('getChatAdministrators'), { params: { chat_id: `@${username}` } })
      .then((response) => {
        const data = response.data;

        if (!data.ok) {
          throw new ValidationError(JSON.stringify(data, null, 2));
        }

        return data.result;
      })
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.response.data));
      });
  }
}

module.exports = TelegramClient;
