import { z } from 'zod';

const rejectedCommandSchema = z.object({
  index: z.number(),
  kind: z.string(),
  reason: z.string(),
});
const changeSchema = z.object({
  commandIndex: z.number(),
  entityId: z.string(),
  field: z.string(),
  before: z.unknown(),
  after: z.unknown(),
});
const outcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('confirmation-required'),
    proposalId: z.string(),
    diff: z.object({ changes: z.array(changeSchema) }),
    rejectedCommands: z.array(rejectedCommandSchema),
  }),
  z.object({
    kind: z.literal('applied'),
    revision: z.number(),
    rejectedCommands: z.array(rejectedCommandSchema),
  }),
  z.object({
    kind: z.literal('rejected'),
    error: z.object({ kind: z.string(), message: z.string().optional() }),
  }),
]);

export type ChatChange = z.infer<typeof changeSchema>;
export type ChatRejectedCommand = z.infer<typeof rejectedCommandSchema>;
export type ChatOutcome = z.infer<typeof outcomeSchema>;

/** Main sends plain JSON; anything that does not match is shown as an error. */
export function parseChatOutcome(value: unknown): ChatOutcome | undefined {
  const parsed = outcomeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
