'use strict';

const TwitterClientMock = jest.fn().mockImplementation(() =>
  ({
    verifyAuthorizationInfo: () =>
      ({
        additional_info: {
          id: '1111',
          name: 'xxxx',
          username: 'xxxx',
          profile_link: 'https://twitter.com/xxxx',
        },
      }),
  }));

module.exports = TwitterClientMock;
