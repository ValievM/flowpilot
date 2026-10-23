import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Temporal } from 'temporal-polyfill';
import type { Outcome, Series } from '../../domain';
import { RepeatPanel } from './repeat-panel';

afterEach(cleanup);

const today = Temporal.PlainDate.from('2026-10-05');
const now = Temporal.PlainTime.from('17:00');

function series(overrides: Partial<Series> = {}): Series {
  return {
    id: 'training',
    title: 'Тренировка',
    weekdays: [1],
    startsOn: Temporal.PlainDate.from('2026-08-31'),
    ...overrides,
  };
}

function outcome(kind: Outcome['kind'], date: Temporal.PlainDate): Outcome {
  if (kind === 'rescheduled') {
    return {
      kind,
      seriesId: 'training',
      date,
      newDate: date.add({ days: 1 }),
      newTime: Temporal.PlainTime.from('19:00'),
      recordedAt: Temporal.Instant.from('2026-10-01T12:00Z'),
    };
  }
  return {
    kind,
    seriesId: 'training',
    date,
    recordedAt: Temporal.Instant.from('2026-10-01T12:00Z'),
  };
}

function renderPanel(
  options: {
    readonly series?: readonly Series[];
    readonly outcomes?: readonly Outcome[];
    readonly time?: Temporal.PlainTime;
    readonly showNow?: boolean;
  } = {},
) {
  const onOutcome = vi.fn();
  const onUpdate = vi.fn();
  const onStop = vi.fn();
  const onReschedule = vi.fn();
  const view = render(
    <RepeatPanel
      series={
        options.series ?? [series(options.time ? { time: options.time } : {})]
      }
      outcomes={options.outcomes ?? []}
      today={today}
      now={now}
      showNow={options.showNow ?? false}
      onOutcome={onOutcome}
      onUpdate={onUpdate}
      onStop={onStop}
      onReschedule={onReschedule}
    />,
  );
  return { ...view, onOutcome, onUpdate, onStop, onReschedule };
}

describe('repeat schedule UI', () => {
  it('shows selected weekday instances today and offers them now only after their time', () => {
    const timed = series({ time: Temporal.PlainTime.from('18:00') });
    const day = renderPanel({ series: [timed] });
    expect(
      screen.getByRole('heading', { name: 'Повторы сегодня' }),
    ).toBeVisible();
    expect(screen.getByText('Тренировка')).toBeVisible();
    day.unmount();

    const nowPanel = renderPanel({ series: [timed], showNow: true });
    expect(
      screen.queryByRole('heading', { name: 'Повторы сейчас' }),
    ).not.toBeInTheDocument();
    nowPanel.unmount();

    render(
      <RepeatPanel
        series={[timed]}
        outcomes={[]}
        today={today}
        now={Temporal.PlainTime.from('18:00')}
        showNow
        onOutcome={vi.fn()}
        onUpdate={vi.fn()}
        onStop={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Повторы сейчас' }),
    ).toBeVisible();
  });

  it('records only today as done and leaves the series available for tomorrow', () => {
    const { onOutcome } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Выполнено' }));
    expect(onOutcome).toHaveBeenCalledWith('training', {
      kind: 'done',
      date: today,
    });
  });

  it('groups five missed dates into one row per series', () => {
    renderPanel({
      series: [
        series(),
        series({
          id: 'reading',
          title: 'Чтение',
          startsOn: Temporal.PlainDate.from('2026-09-28'),
        }),
      ],
    });
    const groups = screen.getByRole('region', { name: 'Пропуски' });
    expect(
      within(groups).getByRole('button', { name: 'Тренировка ×5' }),
    ).toBeVisible();
    expect(
      within(groups).getByRole('button', { name: 'Чтение ×1' }),
    ).toBeVisible();
  });

  it('requires confirmation before dismissing a missed date', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const past = outcome('skipped', today.subtract({ days: 7 }));
    const { onOutcome } = renderPanel({ outcomes: [past] });
    fireEvent.click(screen.getByRole('button', { name: 'Тренировка ×5' }));
    const closeButton = screen.getAllByRole('button', { name: 'Закрыть' })[0];
    if (!closeButton) throw new Error('Expected a missed-date close button.');
    fireEvent.click(closeButton);
    expect(confirm).toHaveBeenCalledOnce();
    expect(onOutcome).not.toHaveBeenCalled();
  });

  it('marks a past date done and removes it from the missed group', () => {
    const { onOutcome, rerender } = renderPanel();
    const completedDate = Temporal.PlainDate.from('2026-08-31');
    fireEvent.click(screen.getByRole('button', { name: 'Тренировка ×5' }));
    const doneButton = screen.getAllByRole('button', {
      name: 'Отметить выполненным',
    })[0];
    if (!doneButton)
      throw new Error('Expected a missed-date completion button.');
    fireEvent.click(doneButton);
    expect(onOutcome).toHaveBeenCalledWith('training', {
      kind: 'done',
      date: completedDate,
    });
    const completed = outcome('done', completedDate);
    rerender(
      <RepeatPanel
        series={[series()]}
        outcomes={[
          {
            ...completed,
            recordedAt: Temporal.Instant.from('2026-10-02T12:00Z'),
          },
        ]}
        today={today}
        now={now}
        showNow={false}
        onOutcome={onOutcome}
        onUpdate={vi.fn()}
        onStop={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Тренировка ×4' })).toBeVisible();
  });

  it('requires an explicit date and time before moving a timed instance', () => {
    const { onReschedule } = renderPanel({
      time: Temporal.PlainTime.from('18:00'),
    });
    fireEvent.click(screen.getByText('Перенести'));
    const submit = screen.getByRole('button', { name: 'Подтвердить перенос' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Новая дата'), {
      target: { value: '2026-10-06' },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Новое время'), {
      target: { value: '19:30' },
    });
    fireEvent.click(submit);
    expect(onReschedule).toHaveBeenCalledWith('training', {
      kind: 'rescheduled',
      seriesId: 'training',
      date: today,
      newDate: Temporal.PlainDate.from('2026-10-06'),
      newTime: Temporal.PlainTime.from('19:30'),
    });
  });

  it('edits series details and stops the series at the current date', () => {
    const { onUpdate, onStop } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Тренировка' }));
    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Тренировка утром' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить серию' }));
    expect(onUpdate).toHaveBeenCalledWith(
      'training',
      expect.objectContaining({ title: 'Тренировка утром' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Тренировка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Остановить серию' }));
    expect(onStop).toHaveBeenCalledWith('training', today);
  });

  it('lets the series be stopped from the missed group after skipping its only available instance', () => {
    const { onStop } = renderPanel({
      series: [series({ startsOn: today })],
      outcomes: [outcome('skipped', today)],
    });
    expect(
      screen.queryByRole('button', { name: 'Выполнено' }),
    ).not.toBeInTheDocument();
    const groups = screen.getByRole('region', { name: 'Пропуски' });
    fireEvent.click(
      within(groups).getByRole('button', {
        name: 'Настроить серию «Тренировка»',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Остановить серию' }));
    expect(onStop).toHaveBeenCalledWith('training', today);
  });

  it('does not offer a skipped instance in the now view', () => {
    renderPanel({ outcomes: [outcome('skipped', today)], showNow: true });
    expect(
      screen.queryByRole('heading', { name: 'Повторы сейчас' }),
    ).not.toBeInTheDocument();
  });
  it('keeps a row short: the time is shown only when set, no filler words, no repeated date', () => {
    const timed = series({ time: Temporal.PlainTime.from('18:00') });
    const plain = series({ id: 'reading', title: 'Чтение' });
    renderPanel({ series: [timed, plain] });
    const rows = screen.getAllByRole('listitem');
    const training = rows.find((row) => row.textContent.includes('Тренировка'));
    const reading = rows.find((row) => row.textContent.includes('Чтение'));
    expect(training).toHaveTextContent('18:00');
    expect(reading).not.toHaveTextContent('Без времени');
    expect(screen.queryByText('○ Запланировано')).not.toBeInTheDocument();
    expect(screen.queryByText('5 октября')).not.toBeInTheDocument();
  });

  it('still names a finished instance so it is clear why the actions are gone', () => {
    renderPanel({ outcomes: [outcome('done', today)] });
    expect(screen.getByText(/Выполнено/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Пропустить' }),
    ).not.toBeInTheDocument();
  });
});
