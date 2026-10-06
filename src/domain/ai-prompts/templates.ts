import { PROMPT_DATA } from './template-data';

export interface RenderedPrompt {
  readonly id: string;
  readonly version: string;
  readonly instruction: string;
  readonly responseSchema: Readonly<Record<string, unknown>>;
  readonly data: string;
  readonly fingerprint: string;
}

export interface NowPromptInput {
  readonly taskIds: readonly string[];
  readonly availableTaskIds: readonly string[];
  readonly version?: string;
}

export interface CreateCardsPromptInput {
  readonly text: string;
  readonly knownTaskIds: readonly string[];
  readonly version?: string;
}

export interface ReplanPromptInput {
  readonly taskIds: readonly string[];
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
    taskIds: input.taskIds,
    availableTaskIds: input.availableTaskIds,
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
    taskIds: input.taskIds,
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
