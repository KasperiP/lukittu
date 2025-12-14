import dotenv from 'dotenv';
import fs from 'fs';
import type { PrismaConfig } from 'prisma';
import { env } from 'prisma/config';

if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
} else {
  // Prisma 7+ requires a DATABASE_URL to be set, so we load the example env file if no .env file is found
  dotenv.config({ path: '.env.example' });
}

export default {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
} satisfies PrismaConfig;
