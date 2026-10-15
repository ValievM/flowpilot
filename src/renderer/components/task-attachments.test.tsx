import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentMetadata, Task } from '../../domain';
import type { FlowPilotApi, IpcSnapshot } from '../../shared/contracts';
import { TaskAttachments, formatAttachmentSize } from './task-attachments';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const attachment: AttachmentMetadata = {
  id: 'file-1',
  name: 'Конспект.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 1_572_864,
};

function task(attachments: readonly AttachmentMetadata[] = []): Task {
  return {
    id: 'task-1',
    title: 'Подготовить проект',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments,
    addedOrder: 1,
  };
}

function renderAttachments(
  options: {
    readonly add?: FlowPilotApi['attachments']['add'];
    readonly open?: FlowPilotApi['attachments']['open'];
    readonly remove?: FlowPilotApi['attachments']['remove'];
    readonly attachments?: readonly AttachmentMetadata[];
  } = {},
) {
  const refresh = vi.fn(() => Promise.resolve({} as IpcSnapshot));
  const api = {
    attachments: {
      add:
        options.add ??
        vi.fn(() =>
          Promise.resolve({ ok: false, error: 'Cancelled' as const }),
        ),
      open:
        options.open ?? vi.fn(() => Promise.resolve({ ok: true, value: null })),
      remove:
        options.remove ??
        vi.fn(() => Promise.resolve({ ok: true, value: {} as IpcSnapshot })),
    },
  } as unknown as FlowPilotApi;
  const view = render(
    <TaskAttachments
      task={task(options.attachments)}
      refresh={refresh}
      api={api}
    />,
  );
  return { ...view, refresh, api };
}

describe('task attachments', () => {
  it.each([
    [0, '0 Б'],
    [1023, '1023 Б'],
    [1_572_864, '1,5 МБ'],
  ])('formats %i attachment bytes as %s', (size, expected) => {
    expect(formatAttachmentSize(size)).toBe(expected);
  });

  it('shows attachment name, size, type, and accessible actions', () => {
    renderAttachments({ attachments: [attachment] });

    expect(screen.getByText('Конспект.pdf')).toBeVisible();
    expect(screen.getByText('1,5 МБ · application/pdf')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Добавить файл' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Открыть' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Удалить файл Конспект.pdf' }),
    ).toBeEnabled();
    expect(
      screen.getByText('Содержимое файла приложение само не читает.'),
    ).toBeVisible();
  });

  it('adds a file through the system dialog API and refreshes the task list', async () => {
    const add = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: {} as IpcSnapshot }),
    );
    const { refresh, rerender, api } = renderAttachments({ add });

    fireEvent.click(screen.getByRole('button', { name: 'Добавить файл' }));

    await waitFor(() => {
      expect(add).toHaveBeenCalledWith({ taskId: 'task-1' });
    });
    expect(refresh).toHaveBeenCalledOnce();
    rerender(
      <TaskAttachments task={task([attachment])} refresh={refresh} api={api} />,
    );
    expect(screen.getByText('Конспект.pdf')).toBeVisible();
  });

  it('keeps cancellation silent and does not refresh the list', async () => {
    const { refresh } = renderAttachments();

    fireEvent.click(screen.getByRole('button', { name: 'Добавить файл' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Добавить файл' }),
      ).toBeEnabled(),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('reports the file size limit after TooLarge', async () => {
    const add = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: 'TooLarge' as const }),
    );
    renderAttachments({ add });

    fireEvent.click(screen.getByRole('button', { name: 'Добавить файл' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('лимит 100 МБ');
  });

  it.each([
    ['NotReadable', 'Не удалось прочитать файл'],
    ['FileNotFound', 'Файл не найден'],
  ] as const)('explains the %s file error', async (error, message) => {
    const add = vi.fn(() => Promise.resolve({ ok: false as const, error }));
    renderAttachments({ add });

    fireEvent.click(screen.getByRole('button', { name: 'Добавить файл' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('opens the selected attachment by its id', async () => {
    const open = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: null }),
    );
    renderAttachments({ attachments: [attachment], open });

    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ attachmentId: 'file-1' });
    });
  });

  it('retains the missing attachment row and offers its removal', async () => {
    const open = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: 'MissingFile' as const }),
    );
    renderAttachments({ attachments: [attachment], open });

    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Файл исчез с диска',
    );
    expect(screen.getByText('Конспект.pdf')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Удалить файл Конспект.pdf' }),
    ).toBeEnabled();
  });

  it('removes only after confirmation and refreshes after success', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const remove = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: {} as IpcSnapshot }),
    );
    const { refresh } = renderAttachments({
      attachments: [attachment],
      remove,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить файл Конспект.pdf' }),
    );

    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith({ attachmentId: 'file-1' });
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not remove when confirmation is declined', () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const remove = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: {} as IpcSnapshot }),
    );
    renderAttachments({ attachments: [attachment], remove });

    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить файл Конспект.pdf' }),
    );

    expect(remove).not.toHaveBeenCalled();
  });
});
