import { PrismaClient } from '@lukittu/prisma';

declare global {
  // eslint-disable-next-line no-unused-vars, no-var
  var prisma:
    | PrismaClient<{
        omit: {
          user: {
            passwordHash: true;
          };
          session: {
            sessionId: true;
          };
          license: {
            licenseKeyLookup: true;
          };
          keyPair: {
            privateKey: true;
          };
          apiKey: {
            key: true;
          };
        };
      }>
    | undefined;
}

const prisma =
  global.prisma ||
  new PrismaClient({
    omit: {
      user: {
        passwordHash: true,
      },
      session: {
        sessionId: true,
      },
      license: {
        licenseKeyLookup: true,
      },
      keyPair: {
        privateKey: true,
      },
      apiKey: {
        key: true,
      },
    },
  });

if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export default prisma;
