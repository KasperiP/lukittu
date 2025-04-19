import { PrismaClient } from './generated/client';
export * from './generated/client';

declare global {
  // eslint-disable-next-line no-var
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

export { prisma };

export * from './src/constants/regex';
export * from './src/licenses/license-status';
export * from './src/licenses/generate-license';
export * from './src/logging/logger';
export * from './src/security/crypto';
