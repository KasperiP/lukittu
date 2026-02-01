import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../prisma/generated/client';

const prismaOmitConfig = {
  user: {
    passwordHash: true,
  },
  userRecoveryCode: {
    code: true,
  },
  userTOTP: {
    secret: true,
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
} satisfies Prisma.GlobalOmitConfig;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const options = {
  omit: prismaOmitConfig,
  adapter,
} satisfies Prisma.PrismaClientOptions;

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = new PrismaClient(options);

export { prisma };
