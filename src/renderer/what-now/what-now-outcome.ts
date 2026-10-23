import { z } from 'zod';

const resultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('recommendation'),
    answer: z.object({
      action: z
        .object({ taskId: z.string(), subtaskId: z.string().optional() })
        .nullable(),
      reason: z.string(),
    }),
  }),
  z.object({ kind: z.literal('no-available-tasks'), reason: z.string() }),
]);

export type WhatNowView = z.infer<typeof resultSchema>;

export function parseWhatNow(value: unknown): WhatNowView | undefined {
  const parsed = resultSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
