import {
  iso2toIso3,
  iso2ToName,
  iso3toIso2,
  iso3ToName,
} from './country-helpers';

describe('country-helpers', () => {
  describe('iso2toIso3', () => {
    it('converts valid ISO2 to ISO3', () => {
      expect(iso2toIso3('FI')).toBe('FIN');
      expect(iso2toIso3('US')).toBe('USA');
    });

    it('handles null input', () => {
      expect(iso2toIso3(null)).toBeNull();
    });

    it('is case insensitive', () => {
      expect(iso2toIso3('fi')).toBe('FIN');
      expect(iso2toIso3('Fi')).toBe('FIN');
    });

    it('returns null for invalid country code', () => {
      expect(iso2toIso3('XX')).toBeNull();
    });
  });

  describe('iso3toIso2', () => {
    it('converts valid ISO3 to ISO2', () => {
      expect(iso3toIso2('FIN')).toBe('FI');
      expect(iso3toIso2('USA')).toBe('US');
    });

    it('handles null input', () => {
      expect(iso3toIso2(null)).toBeNull();
    });

    it('is case insensitive', () => {
      expect(iso3toIso2('fin')).toBe('FI');
      expect(iso3toIso2('FiN')).toBe('FI');
    });

    it('returns null for invalid country code', () => {
      expect(iso3toIso2('XXX')).toBeNull();
    });
  });

  describe('iso3ToName', () => {
    it('converts valid ISO3 to country name', () => {
      expect(iso3ToName('FIN')).toBe('Finland');
      expect(iso3ToName('USA')).toBe('United States of America');
    });

    it('handles null input', () => {
      expect(iso3ToName(null)).toBeNull();
    });

    it('is case insensitive', () => {
      expect(iso3ToName('fin')).toBe('Finland');
      expect(iso3ToName('FiN')).toBe('Finland');
    });

    it('returns null for invalid country code', () => {
      expect(iso3ToName('XXX')).toBeNull();
    });
  });

  describe('iso2ToName', () => {
    it('converts valid ISO2 to country name', () => {
      expect(iso2ToName('FI')).toBe('Finland');
      expect(iso2ToName('US')).toBe('United States of America');
    });

    it('handles null input', () => {
      expect(iso2ToName(null)).toBeNull();
    });

    it('is case insensitive', () => {
      expect(iso2ToName('fi')).toBe('Finland');
      expect(iso2ToName('Fi')).toBe('Finland');
    });

    it('returns null for invalid country code', () => {
      expect(iso2ToName('XX')).toBeNull();
    });
  });
});
