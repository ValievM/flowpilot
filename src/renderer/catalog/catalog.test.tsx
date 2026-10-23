import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Discipline, Task, TaskType } from '../../domain/task';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import { TaskCardClassification } from '../components/task-card-classification';
import { CatalogSettings } from '../screens/catalog-settings';
import { CatalogContext, DisciplineTag } from './catalog-context';

afterEach(cleanup);

const types: TaskType[] = [
  { id: 'type-course', name: 'Курсовая' },
  { id: 'type-lab', name: 'Лабораторная' },
];
const disciplines: Discipline[] = [{ id: 'disc-math', name: 'Математика' }];

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Работа',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
    ...overrides,
  };
}

function withCatalog(ui: React.JSX.Element) {
  const reload = vi.fn(() => Promise.resolve());
  render(
    <CatalogContext.Provider value={{ taskTypes: types, disciplines, reload }}>
      {ui}
    </CatalogContext.Provider>,
  );
  return { reload };
}

function stubRules(rules: unknown[] = []) {
  window.flowpilot = {
    rules: { list: () => Promise.resolve({ ok: true, value: rules }) },
  } as unknown as FlowPilotApi;
}

describe('task card classification', () => {
  it('saves the chosen type with one classify command', async () => {
    const onApply = vi.fn(() => Promise.resolve('saved' as const));
    withCatalog(<TaskCardClassification task={task()} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Тип'), {
      target: { value: 'type-lab' },
    });
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'task.classify', taskId: 'task-1', typeId: 'type-lab' },
      ]);
    });
  });

  it('clears the type with "нет"', async () => {
    const onApply = vi.fn(() => Promise.resolve('saved' as const));
    withCatalog(
      <TaskCardClassification
        task={task({ typeId: 'type-lab' })}
        onApply={onApply}
      />,
    );
    fireEvent.change(screen.getByLabelText('Тип'), { target: { value: '' } });
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'task.classify', taskId: 'task-1', typeId: null },
      ]);
    });
  });

  it('creates a new type right from the list and attaches it', async () => {
    const onApply = vi.fn(() => Promise.resolve('saved' as const));
    const { reload } = withCatalog(
      <TaskCardClassification task={task()} onApply={onApply} />,
    );
    fireEvent.change(screen.getByLabelText('Тип'), {
      target: { value: '__create__' },
    });
    fireEvent.change(screen.getByLabelText('Название нового типа'), {
      target: { value: '  Экзамен ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить тип' }));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    const [commands] = onApply.mock.calls[0] as unknown as [
      {
        kind: string;
        taskType?: { id: string; name: string };
        typeId?: string;
      }[],
    ];
    expect(commands[0]).toMatchObject({
      kind: 'taskType.create',
      taskType: { name: 'Экзамен' },
    });
    expect(commands[1]).toMatchObject({
      kind: 'task.classify',
      taskId: 'task-1',
      typeId: commands[0]?.taskType?.id,
    });
    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
  });

  it.each([
    ['', /Введите название/],
    ['курсовая', /уже есть/],
  ])('refuses the name "%s" in words and sends nothing', (name, message) => {
    const onApply = vi.fn(() => Promise.resolve('saved' as const));
    withCatalog(<TaskCardClassification task={task()} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Тип'), {
      target: { value: '__create__' },
    });
    fireEvent.change(screen.getByLabelText('Название нового типа'), {
      target: { value: name },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить тип' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('has named controls for both fields', () => {
    withCatalog(<TaskCardClassification task={task()} onApply={vi.fn()} />);
    expect(screen.getByLabelText('Тип')).toBeVisible();
    expect(screen.getByLabelText('Дисциплина')).toBeVisible();
  });
});

describe('discipline label', () => {
  it('shows the name of a known discipline as text', () => {
    withCatalog(<DisciplineTag id="disc-math" />);
    expect(screen.getByText('Математика')).toBeVisible();
  });

  it('shows nothing, never an internal id, for an unknown discipline', () => {
    const { container } = render(
      <CatalogContext.Provider
        value={{ taskTypes: types, disciplines, reload: vi.fn() }}
      >
        <DisciplineTag id="disc-unknown-123" />
      </CatalogContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(document.body.textContent).not.toContain('disc-unknown-123');
  });
});

describe('types and disciplines in settings', () => {
  it('renames without touching any binding', async () => {
    stubRules();
    const onApply = vi.fn(() => Promise.resolve(true));
    withCatalog(
      <CatalogSettings
        tasks={[task({ typeId: 'type-lab' })]}
        onApply={onApply}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Переименовать: Лабораторная' }),
    );
    fireEvent.change(screen.getByLabelText('Новое название'), {
      target: { value: 'Практика' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить название' }));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'taskType.rename', id: 'type-lab', name: 'Практика' },
      ]);
    });
  });

  it('refuses to rename a value to the name another one already has', () => {
    stubRules();
    const onApply = vi.fn(() => Promise.resolve(true));
    withCatalog(<CatalogSettings tasks={[]} onApply={onApply} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Переименовать: Лабораторная' }),
    );
    fireEvent.change(screen.getByLabelText('Новое название'), {
      target: { value: 'курсовая' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить название' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/уже есть/);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('refuses an empty or duplicate name in words', () => {
    stubRules();
    const onApply = vi.fn(() => Promise.resolve(true));
    withCatalog(<CatalogSettings tasks={[]} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Новый тип'), {
      target: { value: ' ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить тип' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Введите название/);
    fireEvent.change(screen.getByLabelText('Новый тип'), {
      target: { value: 'лабораторная' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить тип' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/уже есть/);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows the consequences first and will not delete a used type without a choice', async () => {
    stubRules();
    const onApply = vi.fn(() => Promise.resolve(true));
    withCatalog(
      <CatalogSettings
        tasks={[
          task({ typeId: 'type-lab' }),
          task({ id: 'task-2', typeId: 'type-lab' }),
        ]}
        onApply={onApply}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить: Лабораторная' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: /Удалить тип «Лабораторная»/,
    });
    expect(dialog).toHaveTextContent('Привязано задач: 2');
    const confirm = screen.getByRole('button', { name: 'Удалить тип' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Что сделать с привязкой'), {
      target: { value: 'type-course' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'taskType.delete', id: 'type-lab', targetId: 'type-course' },
      ]);
    });
  });

  it('can detach instead of moving the binding', async () => {
    stubRules();
    const onApply = vi.fn(() => Promise.resolve(true));
    withCatalog(
      <CatalogSettings
        tasks={[task({ typeId: 'type-lab' })]}
        onApply={onApply}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить: Лабораторная' }),
    );
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Что сделать с привязкой'), {
      target: { value: '__detach__' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Удалить тип' }));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'taskType.delete', id: 'type-lab' },
      ]);
    });
  });

  it('warns that a bound rule will become inactive', async () => {
    stubRules([
      {
        id: 'rule-1',
        status: 'active',
        document: {
          id: 'rule-1',
          title: 'Учебные проекты',
          scope: { task_type_ids: ['type-lab'] },
        },
      },
    ]);
    withCatalog(<CatalogSettings tasks={[]} onApply={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить: Лабораторная' }),
    );
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog).toHaveTextContent(
        /правило «Учебные проекты» станет неактивным/,
      );
    });
  });

  it('deletes an unused value after one plain confirmation', async () => {
    stubRules();
    const onApply = vi.fn(() => Promise.resolve(true));
    withCatalog(<CatalogSettings tasks={[]} onApply={onApply} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить: Математика' }),
    );
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить дисциплину' }));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'discipline.delete', id: 'disc-math' },
      ]);
    });
  });
});
