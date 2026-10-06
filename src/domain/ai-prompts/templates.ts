import { z } from 'zod';
import type { AiContext } from '../ai-context/context-types';

import { PROMPT_DATA } from './template-data';

const contextTextSchema = z.looseObject({});
const promptContextSchema = z
  .looseObject({
    instructions: z.string(),
    today: z.string(),
    now: z.string(),
    tasks: z.array(
      z.looseObject({
        id: z.string(),
        columnId: z.string(),
        state: z.string(),
        availability: z.string(),
        deadlineRisk: contextTextSchema,
        rules: contextTextSchema,
        untrusted: contextTextSchema,
      }),
    ),
    completedCount: z.number(),
    omittedTaskCount: z.number(),
    missedRepeats: z.array(z.unknown()),
    taskTypes: z.array(z.unknown()),
    disciplines: z.array(z.unknown()),
    workdays: z.array(z.number()),
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
