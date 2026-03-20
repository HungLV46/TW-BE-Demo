'use strict';

const settings = require('@config/social_network.js');
const { auth, Client } = require('twitter-api-sdk');
const { ValidationError } = require('@helpers/errors.js');

/**
 * This client is for Authorizing the twitter account. Based on the example code in the following link:
 *    https://developer.twitter.com/en/docs/authentication/oauth-2-0/user-access-token
 *    https://github.com/twitterdev/twitter-api-typescript-sdk#creating-a-confidential-auth-client
 */
class TwitterClient {
  constructor() {
    this.settings = settings.twitter;
    this.authClient = new auth.OAuth2User({
      token: this.settings.BEARER_TOKEN,
      client_id: this.settings.CLIENT_ID,
      client_secret: this.settings.CLIENT_SECRET,
      callback: this.settings.REDIRECT_URL,
      scopes: this.settings.oauth2_verification_scopes,
    });
    this.client = new Client(this.authClient);
  }

  async verifyAuthorizationInfo(authenticationCode, codeChallenge) {
    const authorization = await this.exchangeAccessToken(authenticationCode, codeChallenge);
    this.verifyValidationScope(authorization.scope);
    const user = await this.getUserInfo();
    return { additional_info: user };
  }

  /**
   * Get authorization code (Oauth2.0 PKCE flow).
   *
   * Twitter only provides authorization code with PKCE and refresh token as the supported grant types at the moment.
   * https://developer.twitter.com/en/docs/authentication/oauth-2-0/authorization-code
   *
   * @param {*} authenticationCode
   * @param {*} codeChallenge
   * @returns
   */
  exchangeAccessToken(authenticationCode, codeChallenge) {
    if (!authenticationCode || !codeChallenge) {
      throw new ValidationError('Must specify both authentication code and code challenge!');
    }

    // populate code_verifier property inside authClient (to avoid code_verifier undefined error when calling requestAccessToken)
    // https://github.com/twitterdev/twitter-api-typescript-sdk/issues/25#issuecomment-1202312827
    this.authClient.generateAuthURL({
      code_challenge_method: this.settings.pkce_code_challenge_method,
      code_challenge: codeChallenge,
    });

    return this.authClient
      .requestAccessToken(authenticationCode)
      .then((response) =>
        response.token)
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.error, null, 2));
      });
  }

  async getUserInfo() {
    const userInfo = await this.client.users
      .findMyUser()
      .then((response) =>
        response.data)
      .catch((error) => {
        throw new ValidationError(JSON.stringify(error.error, null, 2));
      });

    return { ...userInfo, profile_link: this.settings.profile_link(userInfo.username) };
  }

  verifyValidationScope(scopesString) {
    if (!scopesString) throw new ValidationError('Scopes are missings!');

    const scopes = scopesString.split(' ');

    // all scopes in setting are in scopesString
    const isValidScope = this.settings.oauth2_verification_scopes.every((verificationScope) =>
      scopes.includes(verificationScope));

    if (!isValidScope) throw new ValidationError("Authorization code doesn't have enough enough scope for verifying social link!");
  }
}

module.exports = TwitterClient;
