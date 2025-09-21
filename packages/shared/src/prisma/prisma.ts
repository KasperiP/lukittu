import { Prisma, PrismaClient } from '../../prisma/generated/client';

const prismaOmitConfig: Prisma.GlobalOmitConfig = {
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
  userDiscordAccount: {
    refreshToken: true,
  },
} as const;

declare global {
  // eslint-disable-next-line no-var
  var prisma:
    | PrismaClient<{
        omit: typeof prismaOmitConfig;
      }>
    | undefined;
}

const prisma =
  global.prisma ||
  new PrismaClient({
    omit: prismaOmitConfig,
  });

if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export { prisma };
