import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Discipline, TaskType } from '../../domain/task';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import type { IpcStoredRule } from '../../shared/rule-contracts';
import { CatalogContext } from '../catalog/catalog-context';
import { RulesScreen } from './rules-screen';

afterEach(cleanup);

const taskTypes: TaskType[] = [
  { id: 'type-course', name: 'Курсовая' },
  { id: 'type-lab', name: 'Лабораторная' },
];
const disciplines: Discipline[] = [{ id: 'disc-math', name: 'Математика' }];

function rule(
  overrides: Partial<IpcStoredRule> & { id: string },
): IpcStoredRule {
  const document = {
    schema_version: 'v1' as const,
    id: overrides.id,
    title: 'Учебные проекты',
    scope: { task_type_ids: ['type-course'], discipline_ids: [] as string[] },
    rules: [
      {
        id: 'p1',
        kind: 'priority' as const,
        level: 'high' as const,
        reason: 'Важно',
      },
      {
        id: 'w1',
        kind: 'time_window' as const,
        mode: 'preferred' as const,
        days: ['monday' as const, 'wednesday' as const],
        start: '18:00',
        end: '20:00',
        time_zone: 'Europe/Moscow',
      },
    ],
    guidance: 'Начинать большие работы заранее.',
  };
  return {
    documentJson: JSON.stringify(document),
    document,
    activeDocument: document,
    status: 'active',
    version: 1,
    errors: [],
    diagnostics: [],
    versions: [],
    ...overrides,
  };
}

function retitled(id: string, title: string): IpcStoredRule['document'] {
  const { document } = rule({ id });
  return document ? { ...document, title } : null;
}

type Api = {
  list: ReturnType<typeof vi.fn>;
  importFile: ReturnType<typeof vi.fn>;
  exportFile: ReturnType<typeof vi.fn>;
  activate: ReturnType<typeof vi.fn>;
  deactivate: ReturnType<typeof vi.fn>;
  bind: ReturnType<typeof vi.fn>;
};

function setup(rules: IpcStoredRule[]): Api {
  const api: Api = {
    list: vi.fn(() => Promise.resolve({ ok: true, value: rules })),
    importFile: vi.fn(() =>
      Promise.resolve({ ok: false, error: { kind: 'Cancelled' } }),
    ),
    exportFile: vi.fn(() => Promise.resolve({ ok: true, value: null })),
    activate: vi.fn(() => Promise.resolve({ ok: true, value: rules[0] })),
    deactivate: vi.fn(() => Promise.resolve({ ok: true, value: rules[0] })),
    bind: vi.fn(() => Promise.resolve({ ok: true, value: rules[0] })),
  };
  window.flowpilot = { rules: api } as unknown as FlowPilotApi;
  render(
    <CatalogContext.Provider
      value={{ taskTypes, disciplines, reload: () => Promise.resolve() }}
    >
      <RulesScreen />
    </CatalogContext.Provider>,
  );
  return api;
}

describe('Rules screen', () => {
  it('lists documents with status, bindings and the number of rules', async () => {
    setup([
      rule({ id: 'r-active' }),
      rule({
        id: 'r-draft',
        status: 'draft',
        activeDocument: null,
        document: retitled('r-draft', 'Математика'),
      }),
    ]);
    const active = await screen.findByRole('article', {
      name: 'Учебные проекты',
    });
    expect(active).toHaveTextContent('Активно');
    expect(active).toHaveTextContent('Курсовая');
    expect(active).toHaveTextContent('2 правила');
    expect(
      screen.getByRole('article', { name: 'Математика' }),
    ).toHaveTextContent('Черновик');
  });

  it('shows the rules in plain words when a document is opened', async () => {
    setup([rule({ id: 'r1' })]);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Показать правила: Учебные проекты',
      }),
    );
    expect(screen.getByText(/Важность: высокая/)).toBeVisible();
    expect(screen.getByText(/предпочтительно/)).toBeVisible();
    expect(screen.getByText(/пн, ср · 18:00–20:00/)).toBeVisible();
    expect(screen.getByText('Начинать большие работы заранее.')).toBeVisible();
  });

  it('shows the field path and says the earlier version is still in force after a bad import', async () => {
    const api = setup([rule({ id: 'r1' })]);
    api.importFile.mockResolvedValue({
      ok: false,
      error: {
        kind: 'RuleInvalid',
        errors: [
          {
            path: 'scope.task_type_ids[0]',
            code: 'unknown-task-type',
            reason: 'Неизвестный тип «labs-old»',
            suggestion: 'Выберите существующий тип.',
          },
        ],
      },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Импортировать файл' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('scope.task_type_ids[0]');
    expect(alert).toHaveTextContent('Неизвестный тип «labs-old»');
    expect(alert).toHaveTextContent('Выберите существующий тип.');
    expect(alert).toHaveTextContent(/Прежняя рабочая версия осталась/);
  });

  it('warns about a document without bindings and offers to bind it', async () => {
    setup([
      rule({
        id: 'r1',
        diagnostics: [
          {
            severity: 'warning',
            code: 'unbound-document',
            documentId: 'r1',
            path: 'scope.task_type_ids',
            action: 'bind',
          },
        ],
      }),
    ]);
    const note = await screen.findByRole('note', { name: /Нет привязки/ });
    expect(note).toHaveTextContent(/не влияет на задачи/);
    expect(
      within(note).getByRole('button', { name: 'Привязать' }),
    ).toBeVisible();
  });

  it('leaves the state alone and says why when activation conflicts', async () => {
    const api = setup([
      rule({ id: 'r1', status: 'draft', activeDocument: null }),
    ]);
    api.activate.mockResolvedValue({
      ok: false,
      error: { kind: 'RuleConflict' },
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Активировать: Учебные проекты',
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/конфликтует с уже активным/);
    expect(
      screen.getByRole('article', { name: 'Учебные проекты' }),
    ).toHaveTextContent('Черновик');
  });

  it('exports the accepted version of an active document', async () => {
    const api = setup([rule({ id: 'r1' })]);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Экспортировать: Учебные проекты',
      }),
    );
    await waitFor(() => {
      expect(api.exportFile).toHaveBeenCalledWith({ id: 'r1' });
    });
  });

  it('shows the saved draft bindings, not the older accepted ones, after a rebind', async () => {
    const base = rule({ id: 'r-rebound' });
    const draft = base.document
      ? {
          ...base.document,
          scope: { task_type_ids: ['type-course', 'type-lab'] },
        }
      : null;
    setup([rule({ id: 'r-rebound', status: 'draft', document: draft })]);
    const card = await screen.findByRole('article', {
      name: 'Учебные проекты',
    });
    expect(card).toHaveTextContent('Курсовая, Лабораторная');
    expect(card).toHaveTextContent('Отключено');
  });

  it('offers no export for a document that has no accepted version yet', async () => {
    setup([rule({ id: 'r-new', status: 'draft', activeDocument: null })]);
    await screen.findByRole('article', { name: 'Учебные проекты' });
    expect(screen.queryByRole('button', { name: /Экспортировать/ })).toBeNull();
  });

  it('shows a calm indicator for problems and never opens a dialog by itself', async () => {
    setup([
      rule({
        id: 'r1',
        diagnostics: [
          {
            severity: 'warning',
            code: 'unbound-document',
            documentId: 'r1',
            path: 'scope.task_type_ids',
            action: 'bind',
          },
        ],
      }),
    ]);
    expect(
      await screen.findByRole('status', { name: 'Требует внимания' }),
    ).toHaveTextContent('1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('binds a document to types and disciplines chosen from the catalog', async () => {
    const api = setup([rule({ id: 'r1' })]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Привязать: Учебные проекты' }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Лабораторная' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Математика' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить привязку' }));
    await waitFor(() => {
      expect(api.bind).toHaveBeenCalledWith({
        id: 'r1',
        scope: {
          task_type_ids: ['type-course', 'type-lab'],
          discipline_ids: ['disc-math'],
        },
      });
    });
  });

  it('explains the empty state: cards stay visible without invented reasons', async () => {
    setup([]);
    expect(await screen.findByText(/Правил пока нет/)).toBeVisible();
    expect(screen.getByText(/без выдуманного обоснования/)).toBeVisible();
  });

  it('has named controls and a heading', async () => {
    setup([rule({ id: 'r1' })]);
    expect(
      await screen.findByRole('heading', {
        name: 'Документы правил',
        level: 1,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Отключить: Учебные проекты' }),
    ).toBeVisible();
  });
});
