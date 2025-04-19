import { firstLetterUppercase, getInitials } from './text-helpers';

describe('firstLetterUppercase', () => {
  it('should capitalize the first letter of a string', () => {
    expect(firstLetterUppercase('hello')).toBe('Hello');
    expect(firstLetterUppercase('world')).toBe('World');
  });

  it('should handle empty string', () => {
    expect(firstLetterUppercase('')).toBe('');
  });

  it('should handle already capitalized string', () => {
    expect(firstLetterUppercase('Hello')).toBe('Hello');
  });
});

describe('getInitials', () => {
  it('should return initials from full name', () => {
    expect(getInitials('John Doe')).toBe('JD');
    expect(getInitials('Alice Smith')).toBe('AS');
  });

  it('should handle single name', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('should handle multiple names but return only first two initials', () => {
    expect(getInitials('John James Doe')).toBe('JJ');
  });

  it('should handle empty string', () => {
    expect(getInitials('')).toBe('');
  });
});
