import { expect } from 'chai';
import uuid from 'uuid';

import SalteAuth from '../../src/salte-auth.js';
import SalteAuthUtilities from '../../src/salte-auth.utilities.js';
import SalteAuthProfile from '../../src/salte-auth.profile.js';

describe('salte-auth', () => {
  let sandbox, auth;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    sandbox.stub(uuid, 'v4').returns('33333333-3333-4333-b333-333333333333');
    sandbox.stub(window, 'setTimeout');
    // NOTE: We're just stubbing these so we can restore it later!
    sandbox.stub(window, 'fetch').callThrough();
    sandbox.stub(XMLHttpRequest.prototype, 'open').callThrough();
    sandbox.stub(XMLHttpRequest.prototype, 'send').callThrough();
    // NOTE: These are functions we never want to call
    sandbox.stub(SalteAuthUtilities.prototype, '$navigate');
    auth = new SalteAuth({
      provider: 'auth0'
    });
  });

  afterEach(() => {
    auth.profile.$clear();
    delete window.salte.auth;
    sandbox.restore();
  });

  describe('function(constructor)', () => {
    it('should be a singleton', () => {
      auth.bogus = 'test';
      expect(auth.bogus).to.equal('test');
      expect(new SalteAuth().bogus).to.equal('test');
    });

    it('should not allow passing an empty config', () => {
      delete window.salte.auth;

      expect(() => new SalteAuth()).to.throw(ReferenceError);
      expect(window.salte.auth).to.be.undefined;
    });

    it('should default storageType and validation', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0'
      });

      expect(auth.$config).to.deep.equal({
        provider: 'auth0',
        storageType: 'session',
        validation: {
          aud: true,
          azp: true,
          nonce: true,
          state: true
        }
      });
      expect(auth.$config).to.deep.equal(auth.profile.$$config);
    });

    it('should support overriding the storageType and validation', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0',
        storageType: 'local',
        validation: {
          nonce: false
        }
      });

      expect(auth.$config).to.deep.equal({
        provider: 'auth0',
        storageType: 'local',
        validation: {
          aud: true,
          azp: true,
          nonce: false,
          state: true
        }
      });
      expect(auth.$config).to.deep.equal(auth.profile.$$config);
    });

    it('should recreate the path to the instance', () => {
      auth.bogus = 'test';
      expect(auth.bogus).to.equal('test');

      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0'
      });

      expect(auth.bogus).to.be.undefined;
      expect(window.salte.auth).to.be.instanceof(SalteAuth);
    });

    it('should destroy the authentication iframe', () => {
      const iframe = document.createElement('iframe');
      parent.document.body.appendChild(iframe);
      iframe.setAttribute('owner', 'salte-auth');

      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0'
      });

      expect(parent.document.querySelector('[owner="salte-auth"]')).to.equal(
        null
      );
    });

    it('should close the popup window', () => {
      const popup = {
        close: sandbox.stub()
      };
      sandbox.stub(SalteAuthUtilities.prototype, '$popup').get(() => popup);

      delete window.salte.auth;

      auth = new SalteAuth({
        storageType: 'local',
        provider: 'auth0'
      });

      expect(popup.close.callCount).to.equal(0);
      setTimeout(() => {
        expect(popup.close.callCount).to.equal(1);
      });
    });

    it('should transfer the storage if we are using "sessionStorage"', () => {
      const popup = {
        close: sandbox.stub()
      };
      sandbox.stub(SalteAuthUtilities.prototype, '$popup').get(() => popup);

      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0'
      });

      expect(popup.close.callCount).to.equal(0);
      setTimeout(() => {
        expect(popup.close.callCount).to.equal(1);
      });
    });

    it('should redirect to the "redirectUrl"', done => {
      const url = `${location.protocol}//${location.host}${
        location.pathname
      }#test=test`;
      sandbox.stub(SalteAuthProfile.prototype, '$validate').returns(undefined);
      sandbox
        .stub(SalteAuthProfile.prototype, '$redirectUrl')
        .get(() => url)
        .set(redirectUrl => {
          expect(redirectUrl).to.equal(undefined);
        });

        delete window.salte.auth;

        auth = new SalteAuth({
        provider: 'auth0',
        redirectLoginCallback: error => {
          expect(error).to.deep.equal(undefined);
          done();
        }
      });

      expect(location.href).to.equal(url);
    });

    it('should validate for errors when redirecting', done => {
      sandbox.stub(SalteAuthProfile.prototype, '$validate').returns({
        code: 'stuff_broke',
        description: 'what did you break!'
      });
      sandbox.stub(SalteAuthProfile.prototype, '$redirectUrl').get(() => 'error');

      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0',
        redirectLoginCallback: error => {
          expect(error).to.deep.equal({
            code: 'stuff_broke',
            description: 'what did you break!'
          });
          done();
        }
      });
    });
  });

  describe('interceptor(fetch)', () => {
    it('should request a new access token if we are not authenticated', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0',
        endpoints: [`${location.protocol}//${location.host}`]
      });

      sandbox
        .stub(auth, 'retrieveAccessToken')
        .returns(Promise.resolve('55555-55555'));

      auth.$utilities.addFetchInterceptor((request) => {
        return Promise.resolve().then(() => {
          expect(request.headers.get('Authorization')).to.equal('Bearer 55555-55555');
        });
      });

      return fetch('/');
    });

    it('should not request a new access token if we do not need to be authenticated', () => {
      auth.$utilities.addFetchInterceptor((request) => {
        return Promise.resolve().then(() => {
          expect(request.headers.get('Authorization')).to.equal(null);
        });
      });

      return fetch('/');
    });
  });

  describe('interceptor(xhr)', () => {
    it('should request a new access token if we are not authenticated', done => {
      sandbox.stub(SalteAuth.prototype, 'retrieveAccessToken').returns(Promise.resolve('55555-55555'));

      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0',
        endpoints: [`${location.protocol}//${location.host}`]
      });

      const setRequestHeaderSpy = sandbox.spy(
        XMLHttpRequest.prototype,
        'setRequestHeader'
      );

      expect(setRequestHeaderSpy.callCount).to.equal(0);

      const request = new XMLHttpRequest();
      request.addEventListener('load', () => {
        expect(setRequestHeaderSpy.callCount).to.equal(1);
        expect(setRequestHeaderSpy.firstCall.args).to.deep.equal([
          'Authorization',
          'Bearer 55555-55555'
        ]);
        done();
      });

      request.open('GET', '/');
      request.send();
    });

    it('should request a new access token if we are not authenticated', done => {
      sandbox.stub(SalteAuth.prototype, 'retrieveAccessToken').returns(Promise.resolve('55555-55555'));

      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0'
      });

      const setRequestHeaderSpy = sandbox.spy(
        XMLHttpRequest.prototype,
        'setRequestHeader'
      );

      expect(setRequestHeaderSpy.callCount).to.equal(0);

      const request = new XMLHttpRequest();
      request.addEventListener('load', () => {
        expect(setRequestHeaderSpy.callCount).to.equal(0);
        done();
      });

      request.open('GET', '/');
      request.send();
    });
  });

  describe('getter($provider)', () => {
    it('should return a provider', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        provider: 'auth0'
      });

      expect(auth.$provider).to.not.be.undefined;
    });

    it('should support custom providers', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        provider: class {}
      });

      expect(auth.$provider).to.equal(auth.$config.provider);
    });

    it('should throw an error if the provider is unsupported', () => {
      auth.$config.provider = 'bogus';

      expect(() => auth.$provider).to.throw('Unknown Provider (bogus)');
    });

    it('should throw an error if the provider was not specified', () => {
      auth.$config.provider = null;

      expect(() => auth.$provider).to.throw('A provider must be specified');
    });
  });

  // TODO: Make this more thorough by including more config params
  describe('getter($accessTokenUrl)', () => {
    it('should compute the accessTokenUrl', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        providerUrl: 'https://api.salte.io',
        redirectUrl: `${location.protocol}//${location.host}`,
        clientId: 'Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC',
        scope: 'openid',
        provider: 'auth0'
      });

      expect(auth.$accessTokenUrl).to.equal(
        `https://api.salte.io/authorize?state=33333333-3333-4333-b333-333333333333&nonce=33333333-3333-4333-b333-333333333333&response_type=token&redirect_uri=${encodeURIComponent(
          `${location.protocol}//${location.host}`
        )}&client_id=Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC&scope=openid&prompt=none`
      );
    });

    it('should utilize authorizeUrl overrides', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        providerUrl: 'https://mydomain.auth.us-east-1.amazoncognito.com',
        redirectUrl: `${location.protocol}//${location.host}`,
        clientId: 'Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC',
        scope: 'openid',
        provider: 'cognito'
      });

      expect(auth.$accessTokenUrl).to.equal(
        `https://mydomain.auth.us-east-1.amazoncognito.com/oauth2/authorize?state=33333333-3333-4333-b333-333333333333&nonce=33333333-3333-4333-b333-333333333333&response_type=token&redirect_uri=${encodeURIComponent(
          `${location.protocol}//${location.host}`
        )}&client_id=Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC&scope=openid&prompt=none`
      );
    });
  });

  describe('getter($loginUrl)', () => {
    it('should compute the loginUrl', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        providerUrl: 'https://api.salte.io',
        responseType: 'id_token',
        redirectUrl: `${location.protocol}//${location.host}`,
        clientId: 'Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC',
        scope: 'openid',
        provider: 'auth0'
      });

      expect(auth.$loginUrl).to.equal(
        `https://api.salte.io/authorize?state=33333333-3333-4333-b333-333333333333&nonce=33333333-3333-4333-b333-333333333333&response_type=id_token&redirect_uri=${encodeURIComponent(
          `${location.protocol}//${location.host}`
        )}&client_id=Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC&scope=openid`
      );
    });

    it('should utilize authorizeEndpoint overrides', () => {
      delete window.salte.auth;

      auth = new SalteAuth({
        providerUrl: 'https://mydomain.auth.us-east-1.amazoncognito.com',
        responseType: 'id_token',
        redirectUrl: `${location.protocol}//${location.host}`,
        clientId: 'Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC',
        scope: 'openid',
        provider: 'cognito'
      });

      expect(auth.$loginUrl).to.equal(
        `https://mydomain.auth.us-east-1.amazoncognito.com/oauth2/authorize?state=33333333-3333-4333-b333-333333333333&nonce=33333333-3333-4333-b333-333333333333&response_type=id_token&redirect_uri=${encodeURIComponent(
          `${location.protocol}//${location.host}`
        )}&client_id=Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC&scope=openid`
      );
    });
  });

  describe('getter($deauthorizeUrl)', () => {
    it('should compute the deauthorizeUrl', done => {
      delete window.salte.auth;

      auth = new SalteAuth({
        providerUrl: 'https://api.salte.io',
        responseType: 'id_token',
        redirectUrl: `${location.protocol}//${location.host}`,
        clientId: 'Hzl9Rvu_Ws_s1QKIhI2TXi8NZRn672FC',
        scope: 'openid',

        provider: 'auth0'
      });

      sandbox
        .stub(auth.$provider, 'deauthorizeUrl')
        .callsFake(function(config) {
          expect(this).to.be.an.instanceof(SalteAuth);
          expect(config).to.deep.equal(salte.auth.$config);
          done();
        });

      auth.$deauthorizeUrl;
    });
  });

  describe('function(loginWithIframe)', () => {
    beforeEach(() => {
      auth.profile.$clear();
      sandbox.stub(SalteAuthProfile.prototype, '$clear');
      sandbox.stub(SalteAuthUtilities.prototype, 'createIframe').returns(Promise.resolve());
      delete window.salte.auth;
      auth = new SalteAuth({
        providerUrl: `${location.protocol}//${location.host}`,
        provider: 'auth0'
      });
    });

    it('should resolve when we have logged in', () => {
      sandbox.stub(auth.profile, '$validate');

      const promise = auth.loginWithIframe();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.login).to.equal(promise);
      return promise.then(() => {
        expect(auth.$promises.login).to.equal(null);
      });
    });

    it('should prevent duplicate promises', () => {
      sandbox.stub(auth.profile, '$validate');

      const promise = auth.loginWithIframe();
      const duplicatePromise = auth.loginWithIframe();

      expect(promise).to.equal(duplicatePromise);

      return promise;
    });

    it('should throw validation errors', () => {
      auth.profile.$idToken = `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe'
        })
      )}.0`;

      const promise = auth.loginWithIframe();

      return promise.catch(error => {
        return error;
      }).then(error => {
        expect(error.code).to.equal('invalid_state');
      });
    });

    it('should handle the iframe failing', () => {
      sandbox.stub(auth, '$loginUrl').get(() => '');
      auth.$utilities.createIframe.restore();
      sandbox
        .stub(auth.$utilities, 'createIframe')
        .returns(Promise.reject('Iframe Failed!'));

      const promise = auth.loginWithIframe();

      return promise.catch(error => {
        return error;
      }).then(error => {
        expect(error).to.deep.equal('Iframe Failed!');
        expect(auth.$promises.login).to.deep.equal(null);
      });
    });
  });

  describe('function(loginWithPopup)', () => {
    it('should resolve when we have logged in', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$loginUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openPopup').returns(Promise.resolve());
      sandbox.stub(auth.profile, '$validate');
      sandbox.stub(auth.profile, '$$transfer');

      const promise = auth.loginWithPopup();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.login).to.equal(promise);
      expect(auth.profile.$$transfer.callCount).to.equal(0);
      return promise.then(() => {
        expect(auth.profile.$$transfer.callCount).to.equal(1);
        expect(auth.$promises.login).to.equal(null);
      });
    });

    it('should bypass transfering storage when using "localStorage"', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$loginUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openPopup').returns(Promise.resolve());
      sandbox.stub(auth.profile, '$validate');
      sandbox.stub(auth.profile, '$$transfer');

      auth.$config.storageType = 'local';

      const promise = auth.loginWithPopup();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.login).to.equal(promise);
      return promise.then(() => {
        expect(auth.profile.$$transfer.callCount).to.equal(0);
        expect(auth.$promises.login).to.equal(null);
      });
    });

    it('should prevent duplicate promises', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$loginUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openPopup').returns(Promise.resolve());
      sandbox.stub(auth.profile, '$validate');

      const promise = auth.loginWithPopup();
      const duplicatePromise = auth.loginWithPopup();

      expect(promise).to.equal(duplicatePromise);

      return promise;
    });

    it('should throw validation errors', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth.$utilities, 'openPopup').returns(Promise.resolve());

      sandbox.stub(auth.profile, '$idToken').get(() => `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe'
        })
      )}.0`);

      const promise = auth.loginWithPopup();

      return promise.catch(error => {
        return error;
      }).then(error => {
        expect(error.code).to.equal('invalid_state');
      });
    });

    it('should handle a popup being blocked', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$loginUrl').get(() => '');
      sandbox
        .stub(auth.$utilities, 'openPopup')
        .returns(Promise.reject('Popup blocked!'));

      auth.profile.$idToken = `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe'
        })
      )}.0`;

      const promise = auth.loginWithPopup();

      return promise.catch(error => {
        return error;
      }).then(error => {
        expect(error).to.deep.equal('Popup blocked!');
        expect(auth.$promises.login).to.deep.equal(null);
      });
    });
  });

  describe('function(loginWithNewTab)', () => {
    it('should resolve when we have logged in', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$loginUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openNewTab').returns(Promise.resolve());
      sandbox.stub(auth.profile, '$validate');
      sandbox.stub(auth.profile, '$$transfer');

      const promise = auth.loginWithNewTab();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.login).to.equal(promise);
      expect(auth.profile.$$transfer.callCount).to.equal(0);
      return promise.then(() => {
        expect(auth.profile.$$transfer.callCount).to.equal(1);
        expect(auth.$promises.login).to.equal(null);
      });
    });

    it('should bypass transfering storage when using "localStorage"', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$loginUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openNewTab').returns(Promise.resolve());
      sandbox.stub(auth.profile, '$validate');
      sandbox.stub(auth.profile, '$$transfer');

      auth.$config.storageType = 'local';

      const promise = auth.loginWithNewTab();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.login).to.equal(promise);
      return promise.then(() => {
        expect(auth.profile.$$transfer.callCount).to.equal(0);
        expect(auth.$promises.login).to.equal(null);
      });
    });

    it('should prevent duplicate promises', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$loginUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openNewTab').returns(Promise.resolve());
      sandbox.stub(auth.profile, '$validate');

      const promise = auth.loginWithNewTab();
      const duplicatePromise = auth.loginWithNewTab();

      expect(promise).to.equal(duplicatePromise);

      return promise;
    });

    it('should throw validation errors', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth.$utilities, 'openNewTab').returns(Promise.resolve());

      sandbox.stub(auth.profile, '$idToken').get(() => `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe'
        })
      )}.0`);

      const promise = auth.loginWithNewTab();

      return promise.catch(error => {
        return error;
      }).then(error => {
        expect(error.code).to.equal('invalid_state');
      });
    });

    it('should handle a popup being blocked', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$loginUrl').get(() => '');
      sandbox
        .stub(auth.$utilities, 'openNewTab')
        .returns(Promise.reject('New Tab blocked!'));

      sandbox.stub(auth.profile, '$idToken').get(() => `0.${btoa(
        JSON.stringify({
          sub: '1234567890',
          name: 'John Doe'
        })
      )}.0`);

      const promise = auth.loginWithNewTab();

      return promise.catch(error => {
        return error;
      }).then(error => {
        expect(error).to.deep.equal('New Tab blocked!');
        expect(auth.$promises.login).to.deep.equal(null);
      });
    });
  });

  describe('function(loginWithRedirect)', () => {
    beforeEach(() => {
      window.setTimeout.restore();
      sandbox.stub(auth.profile, '$clear');
    });

    it('should resolve when we have logged in', () => {
      auth.$config.redirectLoginCallback = sandbox.stub();

      auth.loginWithRedirect();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.profile.$redirectUrl).to.equal(location.href);
      expect(auth.$promises.logout).to.be.undefined;
    });

    it('should prevent duplicate promises', () => {
      auth.$config.redirectLoginCallback = sandbox.stub();

      const promise = auth.loginWithRedirect();
      const duplicatePromise = auth.loginWithRedirect();

      expect(promise).to.equal(duplicatePromise);

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.profile.$redirectUrl).to.equal(location.href);
    });

    it('should require a "redirectLoginCallback" to be provided', () => {
      expect(() => auth.loginWithRedirect()).to.throw(ReferenceError);
    });
  });

  describe('function(logoutWithIframe)', () => {
    it('should resolve when we have logged out', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$deauthorizeUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'createIframe').returns(Promise.resolve());

      const promise = auth.logoutWithIframe();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.logout).to.equal(promise);
      return promise.then(() => {
        expect(auth.$promises.logout).to.equal(null);
      });
    });

    it('should prevent duplicate promises', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$deauthorizeUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'createIframe').returns(Promise.resolve());

      const promise = auth.logoutWithIframe();
      const duplicatePromise = auth.logoutWithIframe();

      expect(promise).to.equal(duplicatePromise);

      return promise;
    });
  });

  describe('function(logoutWithPopup)', () => {
    it('should resolve when we have logged out', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$deauthorizeUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openPopup').returns(Promise.resolve());

      const promise = auth.logoutWithPopup();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.logout).to.equal(promise);
      return promise.then(() => {
        expect(auth.$promises.logout).to.equal(null);
      });
    });

    it('should prevent duplicate promises', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$deauthorizeUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openPopup').returns(Promise.resolve());
      sandbox.stub(auth.profile, '$validate');

      const promise = auth.logoutWithPopup();
      const duplicatePromise = auth.logoutWithPopup();

      expect(promise).to.equal(duplicatePromise);

      return promise;
    });
  });

  describe('function(logoutWithNewTab)', () => {
    it('should resolve when we have logged out', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$deauthorizeUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openNewTab').returns(Promise.resolve());

      const promise = auth.logoutWithNewTab();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.logout).to.equal(promise);
      return promise.then(() => {
        expect(auth.$promises.logout).to.equal(null);
      });
    });

    it('should prevent duplicate promises', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$deauthorizeUrl').get(() => '');
      sandbox.stub(auth.$utilities, 'openNewTab').returns(Promise.resolve());
      sandbox.stub(auth.profile, '$validate');

      const promise = auth.logoutWithNewTab();
      const duplicatePromise = auth.logoutWithNewTab();

      expect(promise).to.equal(duplicatePromise);

      return promise;
    });
  });

  describe('function(logoutWithRedirect)', () => {
    it('should resolve when we have logged out', () => {
      sandbox.stub(auth.profile, '$clear');
      sandbox.stub(auth, '$deauthorizeUrl').get(() => location.href);

      auth.logoutWithRedirect();

      expect(auth.profile.$clear.callCount).to.equal(1);
      expect(auth.$promises.logout).to.be.undefined;
    });
  });

  describe('function(retrieveAccessToken)', () => {
    it('should default to using an iframe for auto logging in', () => {
      sandbox.stub(auth, 'loginWithIframe').returns(Promise.resolve());
      sandbox.stub(auth.profile, 'idTokenExpired').get(() => true);
      sandbox.stub(auth.profile, 'accessTokenExpired').get(() => true);
      sandbox.stub(auth.profile, '$clearErrors');
      sandbox.stub(auth.profile, '$validate');
      sandbox.stub(auth.$utilities, 'createIframe').returns(Promise.resolve());

      const promise = auth.retrieveAccessToken();

      auth.profile.$accessToken = '55555-55555';

      expect(auth.$promises.token).to.equal(promise);
      return promise.then(accessToken => {
        expect(auth.loginWithIframe.callCount).to.equal(1);
        expect(auth.profile.$clearErrors.callCount).to.equal(1);
        expect(accessToken).to.equal('55555-55555');
        expect(auth.$promises.token).to.equal(null);
      });
    });

    it('should support using a popup to auto login', () => {
      auth.$config.loginType = 'popup';

      sandbox.stub(auth, 'loginWithPopup').returns(Promise.resolve());
      sandbox.stub(auth.profile, 'idTokenExpired').get(() => true);
      sandbox.stub(auth.profile, 'accessTokenExpired').get(() => true);
      sandbox.stub(auth.profile, '$clearErrors');
      sandbox.stub(auth.profile, '$validate');
      sandbox.stub(auth.$utilities, 'createIframe').returns(Promise.resolve());

      const promise = auth.retrieveAccessToken();

      auth.profile.$accessToken = '55555-55555';

      expect(auth.$promises.token).to.equal(promise);
      return promise.then(accessToken => {
        expect(auth.loginWithPopup.callCount).to.equal(1);
        expect(auth.profile.$clearErrors.callCount).to.equal(1);
        expect(accessToken).to.equal('55555-55555');
        expect(auth.$promises.token).to.equal(null);
      });
    });

    it('should bypass fetching the tokens if they have not expired', () => {
      sandbox.stub(auth.profile, 'idTokenExpired').get(() => false);
      sandbox.stub(auth.profile, 'accessTokenExpired').get(() => false);
      sandbox.stub(auth.profile, '$clearErrors');

      const promise = auth.retrieveAccessToken();

      auth.profile.$accessToken = '55555-55555';

      expect(auth.$promises.token).to.equal(promise);
      return promise.then(accessToken => {
        expect(auth.profile.$clearErrors.callCount).to.equal(1);
        expect(accessToken).to.equal('55555-55555');
        expect(auth.$promises.token).to.equal(null);
      });
    });

    it('should not allow auto logging in via "redirect"', () => {
      auth.$config.loginType = 'redirect';

      sandbox.stub(auth.profile, 'idTokenExpired').get(() => true);

      const promise = auth.retrieveAccessToken();

      expect(auth.$promises.token).to.equal(null);
      return promise
        .catch(error => {
          return error;
        })
        .then(error => {
          expect(error.message).to.equal('Invaid Login Type (redirect)');
          expect(auth.$promises.token).to.equal(null);
        });
    });

    it('should prevent duplicate promises', () => {
      sandbox.stub(auth, 'loginWithIframe').returns(Promise.resolve());
      sandbox.stub(auth.profile, 'idTokenExpired').get(() => true);
      sandbox.stub(auth.profile, 'accessTokenExpired').get(() => true);
      sandbox.stub(auth.profile, '$clearErrors');
      sandbox.stub(auth.profile, '$validate');
      sandbox.stub(auth.$utilities, 'createIframe').returns(Promise.resolve());

      const promise = auth.retrieveAccessToken();
      const duplicatePromise = auth.retrieveAccessToken();

      auth.profile.$accessToken = '55555-55555';

      expect(promise).to.equal(duplicatePromise);
      return promise;
    });

    it('should throw validation errors', () => {
      sandbox.stub(auth.profile, 'idTokenExpired').get(() => false);
      sandbox.stub(auth.profile, 'accessTokenExpired').get(() => true);
      sandbox.stub(auth.profile, '$clearErrors');
      sandbox.stub(auth.$utilities, 'createIframe').returns(Promise.resolve());

      auth.profile.$accessToken = '55555-55555';

      const promise = auth.retrieveAccessToken();

      return promise.catch(error => {
        return error;
      }).then(error => {
        expect(error.code).to.equal('login_canceled');
      });
    });

    it('should handle the login being blocked', () => {
      auth.$config.loginType = 'popup';

      sandbox
        .stub(auth, 'loginWithPopup')
        .returns(Promise.reject('Popup blocked!'));
      sandbox.stub(auth.profile, 'idTokenExpired').get(() => true);

      const promise = auth.retrieveAccessToken();

      expect(auth.$promises.token).to.equal(promise);
      return promise.catch(error => {
        expect(error).to.deep.equal('Popup blocked!');
        expect(auth.$promises.token).to.equal(null);
      });
    });
  });

  describe('function($$onRouteChanged)', () => {
    it('should authenticate if the route is secure', () => {
      auth.$config.routes = true;

      sandbox.stub(auth, 'retrieveAccessToken').returns(Promise.resolve());

      expect(auth.retrieveAccessToken.callCount).to.equal(0);

      auth.$$onRouteChanged();

      expect(auth.retrieveAccessToken.callCount).to.equal(1);
    });

    it('should not authenticate if the route is not secure', () => {
      auth.$config.routes = false;

      sandbox.stub(auth, 'retrieveAccessToken').returns(Promise.resolve());

      expect(auth.retrieveAccessToken.callCount).to.equal(0);

      auth.$$onRouteChanged();

      expect(auth.retrieveAccessToken.callCount).to.equal(0);
    });
  });
});
