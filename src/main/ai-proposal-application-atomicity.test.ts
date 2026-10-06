import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { todayView } from '../domain';
import { Repository } from '../storage';
import { AiProposalApplication } from './ai-proposal-application';

const directories: string[] = [];
const repositories: Repository[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-06T12:00:00Z') };
const references = () => ({
  ruleVersions: {},
  taskTypes: [],
  disciplines: [],
  rules: [],
});

afterEach(() => {
  repositories.splice(0).forEach((repository) => {
    repository.close();
  });
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-ai-atomic-'));
  directories.push(directory);
  const path = join(directory, 'tasks.sqlite');
  const repository = new Repository(path, clock);
  repositories.push(repository);
  return {
    path,
    repository,
    application: new AiProposalApplication(repository, references),
  };
}

function task(id: string, title: string) {
  return {
    id,
    title,
    columnId: 'todo',
    day: Temporal.PlainDate.from('2026-10-06'),
    subtasks: [],
  };
}

function proposal(id: string, commands: unknown[]) {
  return {
    id,
    baseRevision: 0,
    ruleVersions: {},
    commands,
    rationale: 'Arrange tasks',
    unknowns: [],
    createdAt: '2026-10-06T12:00:00Z',
  };
}

describe('AI proposal atomic application', () => {
  it('serializes concurrent retries of the same proposal id', async () => {
    const { repository, application } = setup();
    const value = proposal('parallel-1', [
      { kind: 'task.create', task: { ...task('once', 'One task') } },
    ]);
    const results = await Promise.all([
      Promise.resolve().then(() => application.applyProposal(value, 'auto')),
      Promise.resolve().then(() =>
        new AiProposalApplication(repository, references).applyProposal(
          value,
          'auto',
        ),
      ),
    ]);
    expect(
      results.map((result) => result.kind === 'applied' && result.replayed),
    ).toEqual([false, true]);

    expect(results.map(({ kind }) => kind)).toEqual(['applied', 'applied']);
    expect(repository.load().revision).toBe(1);
    expect(repository.load().tasks.map(({ id }) => id)).toEqual(['once']);
    expect(repository.history(10).entries).toHaveLength(1);
  });

  it('rolls back every command and the idempotency record when a batch fails', () => {
    const { path, repository, application } = setup();
    const database = new Database(path);
    database.exec(`
      CREATE TRIGGER fail_second_ai_task
      BEFORE INSERT ON tasks
      WHEN NEW.id = 'task-2'
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END;
    `);
    database.close();

    const result = application.applyProposal(
      proposal('atomic-failure', [
        { kind: 'task.create', task: { ...task('task-1', 'First') } },
        { kind: 'task.create', task: { ...task('task-2', 'Second') } },
      ]),
      'auto',
    );

    expect(result).toMatchObject({
      kind: 'rejected',
      error: { kind: 'ApplyFailed' },
    });
    expect(repository.load().tasks).toEqual([]);
    expect(repository.load().revision).toBe(0);
    expect(repository.history(10).entries).toEqual([]);
    expect(repository.appliedProposal('atomic-failure')).toBeUndefined();
  });

  it('undoes one AI packet containing multiple task changes as a whole', () => {
    const { repository, application } = setup();
    const result = application.applyProposal(
      proposal('undo-packet', [
        { kind: 'task.create', task: { ...task('task-1', 'First') } },
        { kind: 'task.create', task: { ...task('task-2', 'Second') } },
      ]),
      'auto',
    );
    expect(result.kind).toBe('applied');

    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.load().tasks).toEqual([]);
    expect(repository.history(2).entries.map(({ source }) => source)).toEqual([
      'undo',
      'ai',
    ]);
  });

  it('persists reorder ranks and exposes the AI order in task views', () => {
    const { repository, application } = setup();
    const created = application.applyProposal(
      proposal('rank-create', [
        { kind: 'task.create', task: { ...task('later', 'Later') } },
        { kind: 'task.create', task: { ...task('first', 'First') } },
      ]),
      'auto',
    );
    expect(created.kind).toBe('applied');
    const revision = repository.load().revision;
    const reordered = application.applyProposal(
      {
        ...proposal('rank-update', [
          { kind: 'task.setAiRank', taskId: 'first', rank: 0 },
          { kind: 'task.setAiRank', taskId: 'later', rank: 1 },
        ]),
        baseRevision: revision,
      },
      'auto',
    );
    expect(reordered.kind).toBe('applied');

    const tasks = repository.load().tasks;
    expect(tasks.find(({ id }) => id === 'first')?.aiRank).toBe(0);
    expect(
      todayView(tasks, Temporal.PlainDate.from('2026-10-06')).map(
        ({ id }) => id,
      ),
    ).toEqual(['first', 'later']);
  });
});
