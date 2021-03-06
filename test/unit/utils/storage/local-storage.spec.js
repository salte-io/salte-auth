import { expect } from 'chai';

import { LocalStorage } from '../../../../src/utils/storage';

describe('LocalStorage', () => {
  const storage = new LocalStorage();

  beforeEach(() => {
    storage.clear();
  });

  describe('function(supported)', () => {
    it('should return true', () => {
      expect(LocalStorage.supported()).to.equal(true);
    });
  });

  describe('function(get)', () => {
    it('should pull from cookies', () => {
      localStorage.setItem('hello', 'world');

      expect(storage.get('hello')).to.equal('world');
    });

    it('should support undefined values', () => {
      expect(storage.get('bogus')).to.equal(null);
    });

    it('should support default values', () => {
      expect(storage.get('bogus', 'default')).to.equal('default');
    });
  });

  describe('function(set)', () => {
    it('should support setting cookies', () => {
      expect(storage.get('hello')).to.equal(null);

      storage.set('hello', 'world');

      expect(storage.get('hello')).to.equal('world');
    });

    it('should support being scoped', () => {
      const scopedStorage = new LocalStorage('scoped');

      expect(scopedStorage.get('hello')).to.equal(null);

      scopedStorage.set('hello', 'world');

      expect(scopedStorage.get('hello')).to.equal('world');
      expect(localStorage.getItem('scoped.hello')).to.equal('world');
    });

    it('should automatically remove null values', () => {
      expect(storage.get('hello')).to.equal(null);

      storage.set('hello', 'world');

      expect(storage.get('hello')).to.equal('world');

      storage.set('hello', null);

      expect(storage.get('hello')).to.equal(null);
    });

    it('should automatically remove undefined values', () => {
      expect(storage.get('hello')).to.equal(null);

      storage.set('hello', 'world');

      expect(storage.get('hello')).to.equal('world');

      storage.set('hello', undefined);

      expect(storage.get('hello')).to.equal(null);
    });
  });

  describe('function(clear)', () => {
    it('should clear all values', () => {
      expect(storage.get('hello')).to.equal(null);
      expect(storage.get('hallo')).to.equal(null);

      storage.set('hello', 'world');
      storage.set('hallo', 'welt');
      storage.clear();

      expect(storage.get('hello')).to.equal(null);
      expect(storage.get('hallo')).to.equal(null);
    });

    it('should ignore values outside its scope', () => {
      const otherStorage = new LocalStorage('my.scope');

      expect(storage.get('hello')).to.equal(null);
      expect(otherStorage.get('hallo')).to.equal(null);

      storage.set('hello', 'world');
      otherStorage.set('hallo', 'welt');

      otherStorage.clear();

      expect(storage.get('hello')).to.equal('world');
      expect(otherStorage.get('hallo')).to.equal(null);
    });
  });
});
