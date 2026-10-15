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
  taskValue: Task = task(),
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
      task={taskValue}
      state={state}
      today={Temporal.PlainDate.from('2026-10-06')}
      workdays={new Set([1, 2, 3, 4, 5])}
      onClose={vi.fn()}
    />,
  );
  const rerenderTask = (nextTask: Task): void => {
    view.rerender(
      <TaskCard
        task={nextTask}
        state={state}
        today={Temporal.PlainDate.from('2026-10-06')}
        workdays={new Set([1, 2, 3, 4, 5])}
        onClose={vi.fn()}
      />,
    );
  };
  return { ...view, applySpy, rerenderTask };
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

  it('rejects an empty title without saving and restores the previous title', () => {
    const { applySpy } = renderCard();
    const title = screen.getByLabelText('Название');

    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.blur(title);

    expect(applySpy).not.toHaveBeenCalled();
    expect(title).toHaveValue('Подготовить проект');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Название не может быть пустым.',
    );
  });

  it('rejects invalid estimates and clears a valid estimate with an empty value', async () => {
    const initialTask = {
      ...task(),
      estimate: { unit: 'workdays' as const, value: 4 },
    };
    const { applySpy } = renderCard(
      () => Promise.resolve('saved'),
      initialTask,
    );
    const estimate = screen.getByLabelText('Остаток, рабочие дни');

    for (const value of ['0', '-1', 'текст']) {
      fireEvent.change(estimate, { target: { value } });
      fireEvent.blur(estimate);
      expect(estimate).toHaveValue('4');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Укажите целое число рабочих дней от 1.',
      );
      expect(applySpy).not.toHaveBeenCalled();
    }

    fireEvent.change(estimate, { target: { value: '' } });
    fireEvent.blur(estimate);
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith([
        {
          kind: 'task.update',
          id: 'task-1',
          changes: { estimate: null },
        },
      ]);
    });
  });

  it('saves waiting only after a non-empty reason is entered', async () => {
    const { applySpy } = renderCard();
    fireEvent.change(screen.getByLabelText('Колонка'), {
      target: { value: 'waiting' },
    });
    const reason = screen.getByLabelText('Причина ожидания');
    const save = screen.getByRole('button', { name: 'Сохранить ожидание' });

    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(applySpy).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: '   ' } });
    expect(save).toBeDisabled();
    expect(applySpy).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: 'Жду ответ' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith([
        {
          kind: 'task.move',
          id: 'task-1',
          columnId: 'waiting',
          status: { kind: 'waiting', reason: 'Жду ответ' },
        },
      ]);
    });
  });

  it('recalculates visible deadline risk through the deadline, estimate, and day fields', async () => {
    let currentTask = task();
    let updateTaskView: (nextTask: Task) => void = () => {};
    const card = renderCard((commands) => {
      const command = commands[0];
      if (command?.kind === 'task.update') {
        if (command.changes.deadline) {
          currentTask = {
            ...currentTask,
            deadline: Temporal.PlainDate.from(command.changes.deadline),
          };
        }
        if (command.changes.day) {
          currentTask = {
            ...currentTask,
            day: Temporal.PlainDate.from(command.changes.day),
          };
        }
        if (command.changes.estimate) {
          currentTask = { ...currentTask, estimate: command.changes.estimate };
        }
        updateTaskView(currentTask);
      }
      return Promise.resolve('saved' as const);
    }, currentTask);
    const { applySpy } = card;
    updateTaskView = card.rerenderTask;

    const deadline = screen.getByLabelText('Срок');
    fireEvent.change(deadline, { target: { value: '2026-10-09' } });
    await waitFor(() => {
      expect(
        screen.getByText(
          'Срок есть, объём неизвестен. По приблизительной оценке.',
        ),
      ).toBeVisible();
    });

    const estimate = screen.getByLabelText('Остаток, рабочие дни');
    fireEvent.change(estimate, { target: { value: '3' } });
    fireEvent.blur(estimate);
    await waitFor(() => {
      expect(screen.queryByText(/^Риск не успеть/)).not.toBeInTheDocument();
      expect(document.querySelector('.risk-label')).toBeNull();
    });

    fireEvent.change(screen.getByLabelText('Дата задачи'), {
      target: { value: '2026-10-07' },
    });
    await waitFor(() => {
      expect(screen.getByText(/^Риск не успеть/)).toBeVisible();
      expect(
        screen.getByText(/^До срока 3 рабочих дня, оценка остатка 3/),
      ).toBeVisible();
      expect(document.querySelector('.risk-label')).toHaveClass('is-risk');
    });
    expect(applySpy).toHaveBeenLastCalledWith([
      {
        kind: 'task.update',
        id: 'task-1',
        changes: { day: '2026-10-07' },
      },
    ]);

    fireEvent.change(deadline, { target: { value: '2026-10-13' } });
    await waitFor(() => {
      expect(screen.queryByText(/^Риск не успеть/)).not.toBeInTheDocument();
      expect(document.querySelector('.risk-label')).toBeNull();
    });
    expect(applySpy).toHaveBeenCalledTimes(4);
  });

  it('cancels pending waiting details when choosing another column', async () => {
    const { applySpy, rerenderTask } = renderCard();
    const column = screen.getByLabelText('Колонка');
    fireEvent.change(column, { target: { value: 'waiting' } });
    expect(screen.getByLabelText('Причина ожидания')).toBeInTheDocument();

    fireEvent.change(column, { target: { value: 'done' } });

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith([
        {
          kind: 'task.move',
          id: 'task-1',
          columnId: 'done',
          status: { kind: 'done' },
        },
      ]);
    });
    rerenderTask({ ...task(), columnId: 'done', status: { kind: 'done' } });
    expect(screen.queryByLabelText('Причина ожидания')).not.toBeInTheDocument();
    expect(column).toHaveValue('done');
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

  it('refreshes clean fields after a stale update while keeping the edited draft', async () => {
    const { applySpy, rerenderTask } = renderCard(() =>
      Promise.resolve('stale'),
    );
    const title = screen.getByLabelText('Название');
    fireEvent.change(title, { target: { value: 'Мой черновик' } });
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Новый комментарий' }),
      { target: { value: 'Комментарий' } },
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

    rerenderTask({
      ...task(),
      title: 'Внешнее название',
      description: 'Актуальное описание',
      estimate: { unit: 'workdays', value: 6 },
    });

    expect(title).toHaveValue('Мой черновик');
    const description = screen.getByLabelText('Описание');
    const estimate = screen.getByLabelText('Остаток, рабочие дни');
    expect(description).toHaveValue('Актуальное описание');
    expect(estimate).toHaveValue('6');
    fireEvent.blur(description);
    expect(applySpy).toHaveBeenCalledTimes(1);
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
