import { z } from 'zod';

export type SetTeamWatermarkingSettingsSchema = z.infer<
  ReturnType<typeof setTeamWatermarkingSettingsSchema>
>;

export const setTeamWatermarkingSettingsSchema = () =>
  z
    .object({
      watermarkingEnabled: z.boolean(),
      staticConstantPoolSynthesis: z.boolean(),
      staticConstantPoolDensity: z.number().min(0).max(100).int(),
      dynamicBytecodeInjection: z.boolean(),
      dynamicBytecodeDensity: z.number().min(0).max(100).int(),
      temporalAttributeEmbedding: z.boolean(),
      temporalAttributeDensity: z.number().min(0).max(100).int(),
    })
    .strict();
