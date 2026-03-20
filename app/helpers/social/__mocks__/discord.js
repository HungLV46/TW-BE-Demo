'use strict';

const DiscordClientMock = jest.fn().mockImplementation(() =>
  ({
    verifyInviteLink: () =>
      ({ username: 'ToTheMars', guild_name: 'guild name' }),
    verifyAuthorizationInfo: () =>
      ({
        authorization_info: {
          access_token: 'xxxxx',
          expires_in: 604800,
          refresh_token: 'xxxxx',
          scope: 'guilds.join identify guilds.members.read guilds bot',
          token_type: 'Bearer',
        },
      }),
  }));

module.exports = DiscordClientMock;
