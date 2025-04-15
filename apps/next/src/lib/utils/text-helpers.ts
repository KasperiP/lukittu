export const firstLetterUppercase = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const getInitials = (fullName: string) => {
  const initials = fullName
    .split(' ')
    .slice(0, 2)
    .map((name) => name.charAt(0))
    .join('');

  return initials;
};

export const normalizePath = (path: string) =>
  path.replace(
    /\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/g,
    '/...',
  );
