import { Prisma, PrismaClient } from '@lukittu/shared';
import { DefaultArgs } from '@lukittu/shared/dist/prisma/generated/client/runtime/library';

export type PrismaTransaction = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
