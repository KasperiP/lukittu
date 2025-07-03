import { Prisma, PrismaClient } from '../../prisma/generated/client';
import { DefaultArgs } from '../../prisma/generated/client/runtime/library';

export type PrismaTransaction = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
