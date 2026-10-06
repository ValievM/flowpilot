import { z } from 'zod';

const taskColumnStateSchema = z.enum(['todo', 'doing', 'done', 'waiting']);
export type AiReferenceColumnState = z.infer<typeof taskColumnStateSchema>;
const referenceIndexSchema = z
  .object({
    columns: z.array(
      z
        .object({ id: z.string().min(1), state: taskColumnStateSchema })
        .strict(),
    ),
    taskTypeIds: z.array(z.string().min(1)),
    disciplineIds: z.array(z.string().min(1)),
    ruleIds: z.array(z.string().min(1)),
    taskIds: z.array(z.string().min(1)),
    subtaskIds: z.array(z.string().min(1)),
    commentIds: z.array(z.string().min(1)),
  })
  .strict();

export type AiReferenceIndex = z.infer<typeof referenceIndexSchema>;
export { referenceIndexSchema as aiReferenceIndexSchema };

export interface AiReferenceSource {
  readonly columns: readonly {
    readonly id: string;
    readonly state: AiReferenceColumnState;
  }[];
  readonly taskTypes: readonly { readonly id: string }[];
  readonly disciplines: readonly { readonly id: string }[];
  readonly rules: readonly { readonly id: string }[];
  readonly tasks: readonly {
    readonly id: string;
    readonly subtasks: readonly { readonly id: string }[];
    readonly comments: readonly { readonly id: string }[];
  }[];
}

export function createAiReferenceIndex(
  snapshot: AiReferenceSource,
): AiReferenceIndex {
  return {
    columns: snapshot.columns.map(({ id, state }) => ({ id, state })),
    taskTypeIds: snapshot.taskTypes.map(({ id }) => id),
    disciplineIds: snapshot.disciplines.map(({ id }) => id),
    ruleIds: snapshot.rules.map(({ id }) => id),
    taskIds: snapshot.tasks.map(({ id }) => id),
    subtaskIds: snapshot.tasks.flatMap((task) =>
      task.subtasks.map(({ id }) => id),
    ),
    commentIds: snapshot.tasks.flatMap((task) =>
      task.comments.map(({ id }) => id),
    ),
  };
}
