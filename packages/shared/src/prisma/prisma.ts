import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma/generated/client';

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

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma =
  global.prisma ||
  new PrismaClient({
    adapter,
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
