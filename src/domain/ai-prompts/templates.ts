import { Temporal } from 'temporal-polyfill';

import { z } from 'zod';
import type { AiContext } from '../ai-context/context-types';

import { PROMPT_DATA } from './template-data';
const contextDateSchema = z.union([
  z.string(),
  z.custom<Temporal.PlainDate>((value) => value instanceof Temporal.PlainDate),
]);

const riskKindSchema = z.enum([
  'none',
  'unknown',
  'ok',
  'tight',
  'short',
  'overdue',
]);
const deadlineRiskSchema = z.union([
  z.looseObject({
    ok: z.literal(true),
    risk: riskKindSchema,
    available: z.number().optional(),
    estimate: z.number().optional(),
    startDate: contextDateSchema.optional(),
    due: contextDateSchema.optional(),
    startsAfterDue: z.boolean(),
  }),
  z.looseObject({
    ok: z.literal(false),
    error: z.enum(['empty-workdays', 'not-integer', 'below-one']),
  }),
]);
const trustMarkerSchema = z.literal('untrusted');
const effectivePrioritySchema = z.looseObject({
  trust: trustMarkerSchema,
  level: z.enum(['high', 'normal', 'low']),
  reason: z.string(),
});
const referenceRuleSchema = z.looseObject({
  trust: trustMarkerSchema,
  documentId: z.string(),
  id: z.string(),
  kind: z.enum(['priority', 'time_window']),
  summary: z.string(),
});
const promptContextSchema = z
  .looseObject({
    instructions: z.string(),
    today: z.string(),
    now: z.string(),
    tasks: z.array(
      z.looseObject({
        id: z.string(),
        untrustedColumn: z
          .looseObject({
            trust: trustMarkerSchema,
            name: z.string(),
            description: z.string(),
          })
          .optional(),
        columnId: z.string(),
        state: z.enum(['todo', 'doing', 'waiting', 'done']),
        availability: z.enum([
          'available-now',
          'today',
          'rolled-over',
          'waiting',
          'future',
        ]),
        deadlineRisk: deadlineRiskSchema,
        rules: z.looseObject({
          trust: trustMarkerSchema,
          effectivePriority: effectivePrioritySchema.nullable(),
          conflict: z.boolean(),
          reference: z.array(referenceRuleSchema),
        }),
        untrusted: z.looseObject({
          trust: trustMarkerSchema,
          title: z.string(),
          description: z.string().optional(),
          waitingReason: z.string().optional(),
          comments: z.array(z.string()),
          guidance: z.array(
            z.looseObject({
              trust: trustMarkerSchema,
              documentId: z.string(),
              text: z.string(),
            }),
          ),
          subtasks: z.array(
            z.looseObject({
              id: z.string(),
              title: z.string(),
              completed: z.boolean(),
            }),
          ),
          attachments: z.array(
            z.looseObject({
              name: z.string(),
              status: z.literal('не прочитано'),
            }),
          ),
        }),
      }),
    ),
    completedCount: z.number(),
    omittedTaskCount: z.number(),
    omittedTaskNotice: z.string().optional(),
    missedRepeats: z.array(
      z.looseObject({
        trust: trustMarkerSchema,
        seriesId: z.string(),
        title: z.string(),
        count: z.number(),
        dates: z.array(z.string()),
        first: z.string(),
        last: z.string(),
      }),
    ),
    taskTypes: z.array(
      z.looseObject({
        trust: trustMarkerSchema,
        id: z.string(),
        name: z.string(),
      }),
    ),
    disciplines: z.array(
      z.looseObject({
        trust: trustMarkerSchema,
        id: z.string(),
        name: z.string(),
      }),
    ),
    workdays: z.array(z.number()),
    schedule: z
      .looseObject({
        status: z.enum(['ok', 'error']),
        fetchedAt: z.string(),
        nearestFixedEvents: z.array(
          z.looseObject({
            trust: trustMarkerSchema,
            key: z.string(),
            title: z.string(),
            start: z.string(),
            end: z.string(),
          }),
        ),
      })
      .optional(),
  })
  .transform((context) => {
    Reflect.deleteProperty(context, 'instructions');
    return context;
  });

export interface RenderedPrompt {
  readonly id: string;
  readonly version: string;
  readonly instruction: string;
  readonly responseSchema: Readonly<Record<string, unknown>>;
  readonly data: string;
  readonly fingerprint: string;
}

export interface NowPromptInput {
  readonly context: AiContext;
  readonly version?: string;
}

export interface CreateCardsPromptInput {
  readonly text: string;
  readonly knownTaskIds: readonly string[];
  readonly version?: string;
}
export interface ReplanPromptInput {
  readonly context: AiContext;
  readonly columnIds: readonly string[];
  readonly version?: string;
}

export interface RuleEditPromptInput {
  readonly instruction: string;
  readonly document: unknown;
  readonly taskIds: readonly string[];
  readonly taskTypeIds: readonly string[];
  readonly disciplineIds: readonly string[];
  readonly version?: string;
}

export function renderNowPrompt(input: NowPromptInput): RenderedPrompt {
  return render('now', input.version, {
    context: promptContext(input.context),
  });
}

export function renderCreateCardsPrompt(
  input: CreateCardsPromptInput,
): RenderedPrompt {
  return render('createCards', input.version, {
    text: input.text,
    knownTaskIds: input.knownTaskIds,
  });
}

export function renderReplanPrompt(input: ReplanPromptInput): RenderedPrompt {
  return render('replan', input.version, {
    context: promptContext(input.context),
    columnIds: input.columnIds,
  });
}

export function renderRuleEditPrompt(
  input: RuleEditPromptInput,
): RenderedPrompt {
  return render('ruleEdit', input.version, {
    instruction: input.instruction,
    document: input.document,
    taskIds: input.taskIds,
    taskTypeIds: input.taskTypeIds,
    disciplineIds: input.disciplineIds,
  });
}

function promptContext(context: AiContext): unknown {
  const result = promptContextSchema.safeParse(context);
  if (!result.success) {
    throw new TypeError('AI prompt context is missing required context fields');
  }
  return result.data;
}

function render(
  id: keyof typeof PROMPT_DATA,
  requestedVersion: string | undefined,
  data: unknown,
): RenderedPrompt {
  const template = PROMPT_DATA[id];
  const version = requestedVersion ?? template.version;
  const serializedData = JSON.stringify(data);
  const instruction = `${template.instruction}\n\nResponse schema:\n${JSON.stringify(template.responseSchema)}`;
  return {
    id,
    version,
    instruction,
    responseSchema: template.responseSchema,
    data: serializedData,
    fingerprint: JSON.stringify([id, version, instruction, serializedData]),
  };
}
