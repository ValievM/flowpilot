import type { AnswerIds, NowAnswerIds, RuleEditIds } from './answer-types';

interface EvaluationCaseBase {
  readonly name: string;
  readonly response: unknown;
  readonly expectedValid: boolean;
}

export type OfflineEvaluationCase = EvaluationCaseBase &
  (
    | { readonly answerKind: 'now'; readonly context: NowAnswerIds }
    | { readonly answerKind: 'createCards'; readonly context: AnswerIds }
    | { readonly answerKind: 'replan'; readonly context: AnswerIds }
    | { readonly answerKind: 'ruleEdit'; readonly context: RuleEditIds }
  );

const validRule = {
  schema_version: 'v1',
  id: 'rule-1',
  title: 'Study priorities',
  scope: { task_type_ids: ['type-1'] },
  rules: [
    {
      id: 'priority-1',
      kind: 'priority',
      level: 'high',
      reason: 'Approaching deadline',
    },
  ],
};

export const OFFLINE_EVALUATION_CASES: readonly OfflineEvaluationCase[] = [
  {
    name: 'available-risky-task',
    answerKind: 'now',
    context: {
      taskIds: ['task-risk'],
      availableTaskIds: ['task-risk'],
      subtasksByTask: [{ taskId: 'task-risk', subtaskIds: ['part-risk'] }],
    },
    response: {
      action: { taskId: 'task-risk', subtaskId: 'part-risk' },
      reason: 'Deadline is close',
    },
    expectedValid: true,
  },
  {
    name: 'no-available-task',
    answerKind: 'now',
    context: { taskIds: [], availableTaskIds: [] },
    response: { action: null, reason: 'Nothing is available' },
    expectedValid: true,
  },
  {
    name: 'unavailable-task',
    answerKind: 'now',
    context: { taskIds: ['task-wait'], availableTaskIds: [] },
    response: { action: { taskId: 'task-wait' }, reason: 'Try it' },
    expectedValid: false,
  },
  {
    name: 'unknown-task',
    answerKind: 'now',
    context: { taskIds: ['task-1'], availableTaskIds: ['task-1'] },
    response: { action: { taskId: 'phantom' }, reason: 'Try it' },
    expectedValid: false,
  },
  {
    name: 'unknown-subtask',
    answerKind: 'now',
    context: {
      taskIds: ['task-1'],
      availableTaskIds: ['task-1'],
      subtasksByTask: [{ taskId: 'task-1', subtaskIds: [] }],
    },
    response: {
      action: { taskId: 'task-1', subtaskId: 'phantom-part' },
      reason: 'Start here',
    },
    expectedValid: false,
  },
  {
    name: 'subtask-belongs-to-another-task',
    answerKind: 'now',
    context: {
      taskIds: ['task-a', 'task-b'],
      availableTaskIds: ['task-a'],
      subtasksByTask: [
        { taskId: 'task-a', subtaskIds: [] },
        { taskId: 'task-b', subtaskIds: ['subtask-b'] },
      ],
    },
    response: {
      action: { taskId: 'task-a', subtaskId: 'subtask-b' },
      reason: 'Start here',
    },
    expectedValid: false,
  },
  {
    name: 'creation-without-deadline',
    answerKind: 'createCards',
    context: { taskIds: [] },
    response: {
      cards: [{ title: 'Read chapter', subtasks: [] }],
      unknowns: [],
    },
    expectedValid: true,
  },
  {
    name: 'ambiguous-friday',
    answerKind: 'createCards',
    context: { taskIds: [] },
    response: {
      cards: [{ title: 'Submit work', subtasks: [] }],
      unknowns: ['Date meant by Friday is unknown'],
    },
    expectedValid: true,
  },
  {
    name: 'invented-id-reference',
    answerKind: 'replan',
    context: { taskIds: ['task-1'], columnIds: ['todo'] },
    response: {
      commands: [{ kind: 'task.move', id: 'ghost', columnId: 'todo' }],
      rationale: 'Move first',
    },
    expectedValid: false,
  },
  {
    name: 'delete-command',
    answerKind: 'replan',
    context: { taskIds: ['task-1'], columnIds: ['todo'] },
    response: {
      commands: [{ kind: 'task.delete', id: 'task-1' }],
      rationale: 'Remove it',
    },
    expectedValid: false,
  },
  {
    name: 'extra-response-field',
    answerKind: 'now',
    context: { taskIds: [], availableTaskIds: [] },
    response: { action: null, reason: 'Nothing available', trace: 'internal' },
    expectedValid: false,
  },
  {
    name: 'estimate-in-hours',
    answerKind: 'createCards',
    context: { taskIds: [] },
    response: {
      cards: [
        { title: 'Study', estimate: { unit: 'hours', value: 2 }, subtasks: [] },
      ],
      unknowns: [],
    },
    expectedValid: false,
  },
  {
    name: 'valid-move-command',
    answerKind: 'replan',
    context: { taskIds: ['task-1'], columnIds: ['doing'] },
    response: {
      commands: [{ kind: 'task.move', id: 'task-1', columnId: 'doing' }],
      rationale: 'Start the urgent task',
    },
    expectedValid: true,
  },
  {
    name: 'valid-rule-document',
    answerKind: 'ruleEdit',
    context: {
      taskIds: ['task-1'],
      taskTypeIds: ['type-1'],
      disciplineIds: [],
    },
    response: { document: validRule, taskId: 'task-1' },
    expectedValid: true,
  },
  {
    name: 'unknown-rule-task',
    answerKind: 'ruleEdit',
    context: {
      taskIds: ['task-1'],
      taskTypeIds: ['type-1'],
      disciplineIds: [],
    },
    response: { document: validRule, taskId: 'missing' },
    expectedValid: false,
  },
  {
    name: 'extra-rule-field',
    answerKind: 'ruleEdit',
    context: {
      taskIds: ['task-1'],
      taskTypeIds: ['type-1'],
      disciplineIds: [],
    },
    response: {
      document: { ...validRule, unexpected: true },
      taskId: 'task-1',
    },
    expectedValid: false,
  },
];
