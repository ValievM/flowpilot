import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { CommandsApplyRequest } from '../../shared/contracts';
import type {
  SchedulePreview,
  ScheduleProblem,
} from '../../shared/schedule-contracts';
import { ageText, sourceName } from '../schedule/schedule-copy';
import { useSchedule } from '../schedule/schedule-context';
import { ManualEvents } from './manual-events';

type ImportState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'preview'; readonly preview: SchedulePreview }
  | { readonly phase: 'done'; readonly count: number }
  | {
      readonly phase: 'error';
      readonly text: string;
      readonly problems: readonly ScheduleProblem[];
    };

interface ScheduleSourcesProps {
  readonly today: Temporal.PlainDate;
  readonly onApply: (
    commands: CommandsApplyRequest['commands'],
  ) => Promise<boolean>;
  readonly onChanged: () => Promise<unknown>;
}

const errorTexts = {
  TooLarge: 'Файл больше 1 МБ. Выберите календарь поменьше.',
  IcsInvalid: 'Файл не удалось прочитать как календарь.',
} as const;

function Preview({
  preview,
  onConfirm,
  onCancel,
}: {
  readonly preview: SchedulePreview;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  return (
    <div
      className="schedule-preview"
      role="group"
      aria-label="Предпросмотр импорта"
    >
      <p>
        Найдено событий: {preview.found} · проблем: {preview.problemCount}
        {preview.firstDate && preview.lastDate
          ? ` · с ${preview.firstDate} по ${preview.lastDate}`
          : ''}
      </p>
      {preview.problems.length > 0 && (
        <ul>
          {preview.problems.map((problem) => (
            <li key={`${String(problem.line)}-${problem.reason}`}>
              Строка {problem.line}: {problem.reason}
            </li>
          ))}
        </ul>
      )}
      <p>Пока вы не подтвердите, ничего не загружено.</p>
      <button
        className="button button-primary"
        type="button"
        onClick={onConfirm}
      >
        Загрузить {preview.found} событий
      </button>
      <button className="button" type="button" onClick={onCancel}>
        Отмена
      </button>
    </div>
  );
}

function SourceList({
  now,
}: {
  readonly now: Temporal.ZonedDateTime;
}): React.JSX.Element {
  const { snapshots } = useSchedule();
  if (snapshots.length === 0) return <p>Источников пока нет.</p>;
  return (
    <ul className="schedule-source-list">
      {snapshots.map((snapshot) => (
        <li key={snapshot.source}>
          <strong>{sourceName(snapshot.source)}</strong> · событий:{' '}
          {snapshot.events.length} · снимок{' '}
          {ageText(
            Temporal.Instant.from(snapshot.fetchedAt).toZonedDateTimeISO(
              now.timeZoneId,
            ),
            now,
          )}
          {snapshot.status === 'error' && (
            <span className="settings-error">
              {' '}
              · ошибка: {snapshot.lastError ?? 'неизвестно'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ScheduleSources({
  today,
  onApply,
  onChanged,
}: ScheduleSourcesProps): React.JSX.Element {
  const { reload } = useSchedule();
  const [state, setState] = React.useState<ImportState>({ phase: 'idle' });
  const now = today.toZonedDateTime(Temporal.Now.timeZoneId());
  const start = async (): Promise<void> => {
    const result = await window.flowpilot.schedule.importFile();
    if (result.ok) {
      setState({ phase: 'preview', preview: result.value });
      return;
    }
    if (result.error.kind === 'Cancelled') return;
    setState({
      phase: 'error',
      text:
        result.error.kind === 'IcsInvalid' || result.error.kind === 'TooLarge'
          ? errorTexts[result.error.kind]
          : 'Не удалось прочитать файл. Данные не изменены.',
      problems: result.error.kind === 'IcsInvalid' ? result.error.problems : [],
    });
  };
  const confirm = async (token: string, count: number): Promise<void> => {
    const result = await window.flowpilot.schedule.confirmImport({ token });
    if (!result.ok) {
      setState({
        phase: 'error',
        text: 'Не удалось загрузить расписание. Данные не изменены.',
        problems: [],
      });
      return;
    }
    await reload();
    await onChanged();
    setState({ phase: 'done', count });
  };
  return (
    <section className="settings-card" aria-labelledby="sources-heading">
      <h2 id="sources-heading">Источники расписания</h2>
      <button className="button" type="button" onClick={() => void start()}>
        Импортировать расписание (.ics)
      </button>
      {state.phase === 'preview' && (
        <Preview
          preview={state.preview}
          onConfirm={() =>
            void confirm(state.preview.token, state.preview.found)
          }
          onCancel={() => {
            setState({ phase: 'idle' });
          }}
        />
      )}
      {state.phase === 'done' && (
        <p role="status">
          Загружено событий: {state.count}. Повторный импорт того же файла не
          создаёт копий.
        </p>
      )}
      {state.phase === 'error' && (
        <div role="alert" className="settings-error">
          <p>{state.text}</p>
          <ul>
            {state.problems.map((problem) => (
              <li key={`${String(problem.line)}-${problem.reason}`}>
                Строка {problem.line}: {problem.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <SourceList now={now} />
      <ManualEvents today={today} onApply={onApply} />
    </section>
  );
}
