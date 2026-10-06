import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach } from 'vitest';
import { Repository } from '../storage';
import { AiProposalApplication } from './ai-proposal-application';
import type { AiReferenceData } from './ai-proposal-application';

const directories: string[] = [];
const repositories: Repository[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-06T12:00:00Z') };
export const emptyReferences: AiReferenceData = {
  ruleVersions: {},
  taskTypes: [],
  disciplines: [],
  rules: [],
};

afterEach(() => {
  repositories.splice(0).forEach((repository) => {
    repository.close();
  });
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

export function setup(
  references: () => AiReferenceData = () => emptyReferences,
) {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-ai-proposal-'));
  directories.push(directory);
  const repository = new Repository(join(directory, 'tasks.sqlite'), clock);
  repositories.push(repository);
  return {
    repository,
    application: new AiProposalApplication(repository, references),
  };
}

export function aiTask(id: string, title: string) {
  return { id, title, columnId: 'todo', subtasks: [] };
}

export function seedTask(
  repository: Repository,
  id = 'task-1',
  title = 'Draft',
) {
  const result = repository.apply(
    [{ kind: 'task.create', task: storageTask(id, title) }],
    0,
  );
  if (!result.ok) throw new Error('Could not seed task');
}

export function proposal(
  id: string,
  baseRevision: number,
  commands: unknown[],
) {
  return {
    id,
    baseRevision,
    ruleVersions: {},
    commands,
    rationale: 'Prepare the task list',
    unknowns: [],
    createdAt: '2026-10-06T12:00:00Z',
  };
}

function storageTask(id: string, title: string) {
  return {
    id,
    title,
    status: { kind: 'todo' as const },
    columnId: 'todo',
    day: Temporal.PlainDate.from('2026-10-06'),
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
  };
}
