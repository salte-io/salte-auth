import chai from 'chai';
import chaiString from 'chai-string';
import sinon from 'sinon';

import { OpenIDProvider } from '../../../src/base/provider-openid';
import { Common } from '../../../src/utils';

import { getParams } from '../../utils/get-params';
import { getError } from '../../utils/get-error';

const { expect } = chai;
chai.use(chaiString);

describe('OpenIDProvider', () => {
  let clock;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    clock = sinon.useFakeTimers(1000);
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  describe('constructor', () => {
    it(`should default the responseType, scope, and renewal`, () => {
      class Example extends OpenIDProvider {
        constructor(config) {
          super(config);

          expect(this.config).to.deep.equal({
            level: 'warn',
            redirectUrl: location.origin,
            responseType: 'id_token',
            scope: 'openid',
            renewal: {
              type: 'auto',
              buffer: 60000
            },
            storage: 'cookie',
            validation: true
          });
        }
      };

      new Example();
    });

    it(`should support overriding renewal type and buffer`, () => {
      class Example extends OpenIDProvider {
        constructor(config) {
          super(config);

          expect(this.config).to.deep.equal({
            level: 'warn',
            redirectUrl: location.origin,
            responseType: 'id_token',
            scope: 'openid',
            renewal: {
              type: 'manual',
              buffer: 5000
            },
            storage: 'cookie',
            validation: true
          });
        }
      };

      new Example({
        renewal: {
          type: 'manual',
          buffer: 5000
        }
      });
    });
  });

  describe('function(secure)', () => {
    it('should support enhancing a Request with the Access Token', async () => {
      class Example extends OpenIDProvider {};

      const example = new Example({
        responseType: 'token'
      });

      example.storage.set('id-token.raw', `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe',
          exp: Date.now() + 99999
        })
      )}.0`);
      example.storage.set('access-token.raw', '12345');
      example.storage.set('access-token.expiration', 99999);
      example.sync();

      const request = new Request('https://google.com');

      expect(await example.secure(request)).to.equal(true);
      expect(request.headers.get('Authorization')).to.equal('Bearer 12345');
    });

    it('should support enhancing a XMLHttpRequest with the Access Token', async () => {
      class Example extends OpenIDProvider {};

      const example = new Example({
        responseType: 'token'
      });

      example.storage.set('id-token.raw', `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe',
          exp: Date.now() + 99999
        })
      )}.0`);
      example.storage.set('access-token.raw', '12345');
      example.storage.set('access-token.expiration', 99999);
      example.sync();

      const request = new XMLHttpRequest();
      sinon.stub(request, 'setRequestHeader');

      expect(await example.secure(request)).to.equal(true);
      expect(request.setRequestHeader.firstCall.args).to.deep.equal(['Authorization', 'Bearer 12345']);
    });

    it(`should return 'login' if we need to login`, async () => {
      class Example extends OpenIDProvider {
        get name() {
          return 'example';
        }

        get login() {
          return 'https://google.com';
        }
      };

      const example = new Example({
        clientID: '12345'
      });

      expect(await example.secure()).equals('login');
    });

    it('should automatically renew the access token if it has expired', async () => {
      class Example extends OpenIDProvider {
        get name() {
          return 'example';
        }

        get login() {
          return 'https://google.com';
        }
      };

      const example = new Example({
        clientID: '12345'
      });

      example.storage.set('id-token.raw', `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe',
          exp: Date.now() + 99999
        })
      )}.0`);
      example.sync();

      sinon.stub(Common, 'iframe').callsFake(() => Promise.resolve());
      sinon.stub(example, 'validate');

      await example.secure();

      expect(Common.iframe.callCount).to.equal(1);
      expect(example.validate.callCount).to.equal(1);
    });

    it('should throw an error on unknown request types', async () => {
      class Example extends OpenIDProvider {};

      const example = new Example({
        clientID: '<client-id>',
        responseType: 'token'
      });

      example.storage.set('id-token.raw', `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe',
          exp: Date.now() + 99999
        })
      )}.0`);
      example.storage.set('access-token.raw', '12345');
      example.storage.set('access-token.expiration', '12345');
      example.storage.set('access-token.expiration', 99999);
      example.sync();

      const error = await getError(example.secure(new Error()));

      expect(error.code).to.equal('unknown_request');
    });

    it(`should skip when we're using Autorization Codes`, async () => {
      class Example extends OpenIDProvider {};

      const example = new Example({
        responseType: 'code'
      });

      expect(await example.secure()).to.equal(true);
    });
  });

  describe('function(validate)', () => {
    it('should support validating the ID Token (JWT)', () => {
      class Example extends OpenIDProvider {};

      const example = new Example();

      example.storage.set('response-type', 'id_token');
      example.storage.set('state', '12345');
      example.storage.set('nonce', '54321');

      return new Promise((resolve) => {
        const token = `0.${btoa(
          JSON.stringify({
            sub: '1234567890',
            name: 'John Doe',
            exp: Date.now() + 1000,
            nonce: '54321'
          })
        )}.0`;

        example.on('login', (error, idToken) => {
          expect(error).to.equal(null);
          expect(idToken.raw).to.equal(token);
          expect(idToken.user).to.deep.equal({
            sub: '1234567890',
            name: 'John Doe',
            exp: Date.now() + 1000,
            nonce: '54321'
          });
          expect(idToken.expired).to.equal(false);
          resolve();
        });

        example.validate({
          state: '12345',
          id_token: token
        });
      });
    });

    it(`should skip when we're using Autorization Codes`, async () => {
      class Example extends OpenIDProvider {};

      const example = new Example();

      example.storage.set('response-type', 'code');
      example.storage.set('state', '12345');
      example.storage.set('nonce', '54321');

      return new Promise((resolve) => {
        example.on('login', (error, code) => {
          expect(error).to.equal(null);
          expect(code).to.equal('54321');
          resolve();
        });

        example.validate({
          state: '12345',
          code: '54321'
        });
      });
    });

    it(`should skip clearing the ID Token when validating an Access Token`, async () => {
      class Example extends OpenIDProvider {};

      const example = new Example();

      example.storage.set('response-type', 'token');
      example.storage.set('state', '12345');

      return new Promise((resolve) => {
        example.on('login', (error, accessToken) => {
          expect(error).to.equal(null);
          expect(accessToken.raw).to.equal('54321');
          resolve();
        });

        example.validate({
          state: '12345',
          access_token: '54321'
        });
      });
    });

    it(`should throw an error on unknown response types`, async () => {
      class Example extends OpenIDProvider {};

      const example = new Example();

      example.storage.set('response-type', 'hello');
      example.storage.set('state', '12345');

      const error = getError(() => example.validate({
        state: '12345',
        access_token: '54321'
      }));

      expect(error.code).to.equal('invalid_response_type');
    });

    it('should throw an error if the ID Token is invalid', () => {
      class Example extends OpenIDProvider {};

      const example = new Example();

      example.storage.set('response-type', 'id_token');
      example.storage.set('state', '12345');
      example.storage.set('nonce', '54321');

      return new Promise((resolve) => {
        const token = `0.0.0`;

        example.on('login', (error, idToken) => {
          expect(error.code).to.equal('invalid_id_token');
          expect(idToken).to.equal(undefined);
          resolve();
        });

        example.validate({
          state: '12345',
          id_token: token
        });
      })
    });

    it(`should throw an error if the nonce doesn't match`, () => {
      class Example extends OpenIDProvider {};

      const example = new Example();

      example.storage.set('response-type', 'id_token');
      example.storage.set('state', '12345');
      example.storage.set('nonce', '54321');

      return new Promise((resolve) => {
        const token = `0.${btoa(
          JSON.stringify({
            sub: '1234567890',
            name: 'John Doe',
            exp: Date.now() + 1000,
            nonce: '12345'
          })
        )}.0`;

        example.on('login', (error, idToken) => {
          expect(error.code).to.equal('invalid_nonce');
          expect(idToken).to.equal(undefined);
          resolve();
        });

        example.validate({
          state: '12345',
          id_token: token
        });
      });
    });
  });

  describe('function($login)', () => {
    it('should construct a login url', () => {
      class Example extends OpenIDProvider {
        get name() {
          return 'example';
        }

        get login() {
          return 'https://google.com';
        }
      };

      const example = new Example({
        clientID: '12345',
        responseType: 'token',
        scope: 'hello'
      });

      const params = getParams(example.$login());

      expect(params.client_id).to.equal('12345');
      expect(params.response_type).to.equal('token');
      expect(params.redirect_uri).to.equal(encodeURIComponent(location.origin));
      expect(params.scope).to.equal('hello');
      expect(params.prompt).to.equal(undefined);
      expect(params.state).to.match(/^example-state-.+/);
      expect(params.nonce).to.match(/^example-nonce-.+/);
    });

    it('should support providing overrides', () => {
      class Example extends OpenIDProvider {
        get name() {
          return 'example';
        }

        get login() {
          return 'https://google.com';
        }
      };

      const example = new Example({
        clientID: '12345',
        responseType: 'token',
        scope: 'hello'
      });

      const params = getParams(example.$login({
        responseType: 'code',
        prompt: 'none'
      }));

      expect(params.client_id).to.equal('12345');
      expect(params.response_type).to.equal('code');
      expect(params.redirect_uri).to.equal(encodeURIComponent(location.origin));
      expect(params.scope).to.equal('hello');
      expect(params.prompt).to.equal('none');
      expect(params.state).to.match(/^example-state-.+/);
      expect(params.nonce).to.match(/^example-nonce-.+/);
    });
  });
});
