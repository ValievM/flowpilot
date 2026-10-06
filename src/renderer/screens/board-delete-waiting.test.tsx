import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcSnapshot } from '../../shared/contracts';
import {
  columns,
  createBoardApi,
  renderBoard,
  snapshot,
  task,
} from './board-test-data';

afterEach(cleanup);

describe('deleting a column into waiting', () => {
  it.each([
    {
      until: '2026-10-10',
      waiting: { reason: 'Жду ответ', until: '2026-10-10' },
    },
    { until: '', waiting: { reason: 'Жду ответ' } },
  ])(
    'requires a reason and passes optional waiting details %#',
    async ({ until, waiting }) => {
      const sourceColumn = {
        id: 'custom',
        name: 'Своя',
        description: '',
        state: 'todo' as const,
        builtIn: false,
      };
      const start = {
        ...snapshot([task('other', 'custom')]),
        columns: [...columns, sourceColumn],
      };
      const api = createBoardApi(start);
      api.applyMock.mockResolvedValueOnce({
        ok: true,
        value: deletedColumnSnapshot(),
      });
      renderBoard(api);
      const source = await screen.findByRole('region', { name: 'Своя' });
      fireEvent.click(
        within(source).getByRole('button', { name: 'Удалить колонку' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Удалить колонку?',
      });
      fireEvent.change(screen.getByLabelText('Переместить карточки в'), {
        target: { value: 'waiting' },
      });

      const reasonField = screen.getByLabelText(/Причина/);
      const untilField = screen.getByLabelText('Срок ожидания необязательно');
      const deleteButton = within(dialog).getByRole('button', {
        name: 'Удалить колонку',
      });
      expect(deleteButton).toBeDisabled();
      fireEvent.click(deleteButton);
      expect(api.applyMock).not.toHaveBeenCalled();

      fireEvent.change(reasonField, { target: { value: waiting.reason } });
      if (until) fireEvent.change(untilField, { target: { value: until } });
      fireEvent.click(deleteButton);

      expect(api.applyMock).toHaveBeenCalledWith({
        commands: [
          {
            kind: 'column.delete',
            id: 'custom',
            targetColumnId: 'waiting',
            waiting,
          },
        ],
        expectedRevision: 12,
      });
      expect(
        await screen.findByText('Изменения сохранены.'),
      ).toBeInTheDocument();
      expect(dialog).not.toBeInTheDocument();
    },
  );
});

function deletedColumnSnapshot(): IpcSnapshot {
  const waitingTask = {
    ...task('other', 'waiting'),
    status: {
      kind: 'waiting' as const,
      reason: 'Жду ответ',
      until: '2026-10-10',
    },
  };
  return { ...snapshot([waitingTask]), revision: 13 };
}
