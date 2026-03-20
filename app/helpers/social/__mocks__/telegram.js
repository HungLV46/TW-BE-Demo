'use strict';

const TelegramClientMock = jest.fn().mockImplementation(() =>
  ({
    verifyAuthorizationInfo: () =>
      ({
        authorization_info: {
          id: 1111,
          first_name: 'xxxx',
          last_name: 'xxxx',
          username: 'xxxx',
          photo_url: 'https://t.me/i/userpic/xxxx_asy.jpg',
          auth_date: 1670913364,
          hash: '63a53dc55b490d5cfcf754f2e31fb9f6ef4bd0bb6d13a2043308686043fb2098',
        },
      }),
    verifyInviteLink: () =>
      true,
  }));

module.exports = TelegramClientMock;
