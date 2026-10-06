import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Temporal } from 'temporal-polyfill';
import type { Task } from '../../domain';
import type { CommandsApplyRequest, IpcSnapshot } from '../../shared/contracts';
import { TaskCard } from './task-card';
import type { PersistedState } from '../use-persisted-tasks';

afterEach(cleanup);

const columns: IpcSnapshot['columns'] = [
  {
    id: 'todo',
    name: 'Сделать',
    description: '',
    state: 'todo',
    builtIn: true,
  },
  {
    id: 'waiting',
    name: 'Ожидание',
    description: '',
    state: 'waiting',
    builtIn: true,
  },
  { id: 'done', name: 'Готово', description: '', state: 'done', builtIn: true },
];

function task(): Task {
  return {
    id: 'task-1',
    title: 'Подготовить проект',
    description: 'Короткое описание',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [{ id: 'sub-1', title: 'Собрать материалы', completed: false }],
    comments: [],
    attachments: [],
    addedOrder: 1,
  };
}

function renderCard(
  applyCard: (
    commands: CommandsApplyRequest['commands'],
  ) => Promise<'saved' | 'stale' | 'failed'> = () =>
    Promise.resolve('saved' as const),
) {
  const applySpy = vi.fn(applyCard);
  const state = {
    columns,
    isSaved: true,
    commandError: undefined,
    applyCard: applySpy,
  } as unknown as PersistedState;
  const view = render(
    <TaskCard
      task={task()}
      state={state}
      today={Temporal.PlainDate.from('2026-10-06')}
      workdays={new Set([1, 2, 3, 4, 5])}
      onClose={vi.fn()}
    />,
  );
  return { ...view, applySpy };
}

describe('task detail card', () => {
  it('saves title on blur and accepts only positive integer workday estimates', async () => {
    const { applySpy } = renderCard();
    const title = screen.getByLabelText('Название');
    fireEvent.change(title, { target: { value: 'Новый заголовок' } });
    fireEvent.blur(title);
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith([
        {
          kind: 'task.update',
          id: 'task-1',
          changes: { title: 'Новый заголовок' },
        },
      ]);
    });

    const estimate = screen.getByLabelText('Остаток, рабочие дни');
    fireEvent.change(estimate, { target: { value: '2.5' } });
    fireEvent.blur(estimate);
    expect(applySpy).toHaveBeenCalledTimes(1);
    fireEvent.change(estimate, { target: { value: '4' } });
    fireEvent.blur(estimate);
    await waitFor(() => {
      expect(applySpy).toHaveBeenLastCalledWith([
        {
          kind: 'task.update',
          id: 'task-1',
          changes: { estimate: { unit: 'workdays', value: 4 } },
        },
      ]);
    });
  });

  it('adds and completes subtasks without moving the parent task', async () => {
    const { applySpy } = renderCard();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Собрать материалы' }),
    );
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith([
        {
          kind: 'subtask.complete',
          taskId: 'task-1',
          subtaskId: 'sub-1',
          completed: true,
        },
      ]);
    });
    const commands = applySpy.mock.calls.flatMap(([items]) => items);
    expect(commands.some((command) => command.kind === 'task.move')).toBe(
      false,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Новая подзадача' }), {
      target: { value: 'Проверить выводы' },
    });
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Подзадачи' })).getByRole(
        'button',
        { name: 'Добавить' },
      ),
    );
    const lastCall = applySpy.mock.calls.at(-1);
    const subtaskCommand = lastCall?.[0][0];
    expect(subtaskCommand?.kind).toBe('subtask.add');
    if (subtaskCommand?.kind === 'subtask.add') {
      expect(subtaskCommand.taskId).toBe('task-1');
      expect(subtaskCommand.subtask.title).toBe('Проверить выводы');
      expect(subtaskCommand.subtask.completed).toBe(false);
    }
  });

  it('announces a stale update and keeps the comment command payload', async () => {
    const { applySpy } = renderCard(() => Promise.resolve('stale'));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Новый комментарий' }),
      { target: { value: 'Позвонил преподавателю' } },
    );
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Комментарии' })).getByRole(
        'button',
        { name: 'Добавить' },
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Данные задачи изменились. Показана актуальная карточка; повторите изменение.',
    );
    const lastCall = applySpy.mock.calls.at(-1);
    const commentCommand = lastCall?.[0][0];
    expect(commentCommand?.kind).toBe('comment.add');
    if (commentCommand?.kind === 'comment.add') {
      expect(commentCommand.taskId).toBe('task-1');
      expect(commentCommand.comment.text).toBe('Позвонил преподавателю');
      expect(commentCommand.comment.id.length).toBeGreaterThan(0);
    }
  });

  it('exposes task fields and omits unsupported attachment actions', () => {
    renderCard();
    expect(screen.getByLabelText('Описание')).toBeInTheDocument();
    expect(screen.getByLabelText('Колонка')).toBeInTheDocument();
    expect(screen.getByLabelText('День')).toBeInTheDocument();
    expect(screen.getByLabelText('Время')).toBeInTheDocument();
    expect(screen.getByLabelText('Срок')).toBeInTheDocument();
    expect(screen.queryByText('Вложения')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Закрыть карточку задачи' }),
    ).toBeInTheDocument();
  });
});
