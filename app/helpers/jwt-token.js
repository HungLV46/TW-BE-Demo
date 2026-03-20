const jwt = require('njwt');
const config = require('@config/config.js');
const { AuthenticationError } = require('./errors');
const randomstring = require('randomstring');
const dayjs = require('dayjs');

const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
};

class TokenHandler {
  static validateToken(token) {
    if (token.startsWith('Bearer')) {
      const decoded = jwt.verify(token.slice(7), config.JWT_SECRET);
      return {
        ...decoded,
        token: token.slice(7),
      };
    }
    throw new AuthenticationError('invalid-token', []);
  }

  static generateJWT(user) {
    const now = Date.now();
    const exp = dayjs().add(90, 'day');

    const accessJwt = jwt.create(
      {
        sub: user.id,
        iat: Math.floor(now / 1000),
      },
      config.JWT_SECRET,
    );
    accessJwt.setExpiration(exp);

    const accessToken = accessJwt.compact();
    const refreshToken = randomstring.generate(30);

    const jti = accessJwt.body.jti;

    return {
      accessToken,
      refreshToken,
      exp,
      jti,
    };
  }

  static generateHasuraJWT(userId, userRole) {
    const now = Date.now();
    const exp = dayjs().add(90, 'day');

    const _userId = userId.toString();
    const accessJwt = jwt.create(
      {
        sub: _userId,
        iat: Math.floor(now / 1000),
        // TODO: temporary set admin
        admin: userRole === ROLES.ADMIN ? 'true' : 'false',
        hasura: {
          'default-role': userRole,
          'user-id': _userId,
        },
      },
      config.JWT_SECRET,
    );
    accessJwt.setExpiration(exp);

    const accessToken = accessJwt.compact();
    const refreshToken = randomstring.generate(30);

    const jti = accessJwt.body.jti;

    return {
      accessToken,
      refreshToken,
      exp,
      jti,
    };
  }
}
module.exports = {
  TokenHandler,
};
