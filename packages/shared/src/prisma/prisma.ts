import { PrismaPg } from '@prisma/adapter-pg';
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

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const options: Prisma.PrismaClientOptions = {
  omit: prismaOmitConfig,
  adapter,
};

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient(options);

if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export { prisma };
