import numberFormatter, { bytesToSize } from './number-helpers';

describe('numberFormatter', () => {
  // Numbers less than 1000
  it('should return numbers less than 1000 as is', () => {
    expect(numberFormatter(999)).toBe(999);
    expect(numberFormatter(0)).toBe(0);
    expect(numberFormatter(100)).toBe(100);
  });

  // Thousands (k)
  it('should format thousands correctly', () => {
    expect(numberFormatter(1000)).toBe('1k');
    expect(numberFormatter(1500)).toBe('1.5k');
    expect(numberFormatter(99999)).toBe('99.9k');
    expect(numberFormatter(100000)).toBe('100k');
  });

  // Millions (M)
  it('should format millions correctly', () => {
    expect(numberFormatter(1000000)).toBe('1M');
    expect(numberFormatter(1500000)).toBe('1.5M');
    expect(numberFormatter(99999999)).toBe('99.9M');
    expect(numberFormatter(100000000)).toBe('100M');
  });

  // Billions (B)
  it('should format billions correctly', () => {
    expect(numberFormatter(1000000000)).toBe('1B');
    expect(numberFormatter(1500000000)).toBe('1.5B');
    expect(numberFormatter(99999999999)).toBe('99.9B');
    expect(numberFormatter(100000000000)).toBe('100B');
  });
});

describe('bytesToSize', () => {
  it('should handle zero bytes', () => {
    expect(bytesToSize(0)).toBe('0 Byte');
  });

  it('should format bytes correctly', () => {
    expect(bytesToSize(500)).toBe('500.0 Bytes');
    expect(bytesToSize(1024)).toBe('1.0 KB');
    expect(bytesToSize(1048576)).toBe('1.0 MB');
    expect(bytesToSize(1073741824)).toBe('1.0 GB');
    expect(bytesToSize(1099511627776)).toBe('1.0 TB');
  });

  it('should show one decimal place', () => {
    expect(bytesToSize(1536)).toBe('1.5 KB');
    expect(bytesToSize(1600000)).toBe('1.5 MB');
  });
});
