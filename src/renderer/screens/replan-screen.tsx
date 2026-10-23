import React from 'react';
import type { Task } from '../../domain/task';
import { describeChanges } from '../chat/chat-copy';
import type { ChatChange } from '../chat/chat-outcome';
import type { ReplanModel } from '../replan/use-replan';

interface ReplanScreenProps {
  readonly replan: ReplanModel;
  readonly tasks: readonly Task[];
  readonly mode: 'auto' | 'confirm';
  readonly loadMode: () => void;
}

function rowsFor(
  changes: readonly ChatChange[],
  tasks: readonly Task[],
): { id: string; title: string; before: string; after: string }[] {
  const ids = [...new Set(changes.map((change) => change.entityId))];
  return ids.map((id) => {
    const rows = describeChanges(
      changes.filter((change) => change.entityId === id),
    );
    return {
      id,
      title: tasks.find((task) => task.id === id)?.title ?? 'Задача',
      before: rows.map((row) => `${row.label}: ${row.before}`).join(' · '),
      after: rows.map((row) => `${row.label}: ${row.after}`).join(' · '),
    };
  });
}

function Basis({ text }: { readonly text: string }): React.JSX.Element | null {
  const [open, setOpen] = React.useState(false);
  if (!text) return null;
  return (
    <div className="replan-basis">
      <button
        className="button"
        type="button"
        aria-expanded={open}
        aria-controls="replan-basis-text"
        onClick={() => {
          setOpen(!open);
        }}
      >
        Основание
      </button>
      <p id="replan-basis-text" hidden={!open}>
        {text}
      </p>
    </div>
  );
}

function Proposal({
  replan,
  tasks,
}: {
  readonly replan: ReplanModel;
  readonly tasks: readonly Task[];
}): React.JSX.Element | null {
  const { state, stale } = replan;
  if (state.phase !== 'proposal') return null;
  const rows = rowsFor(state.changes, tasks);
  return (
    <>
      <table className="replan-table" aria-label="До и после">
        <thead>
          <tr>
            <th scope="col">Задача</th>
            <th scope="col">Сейчас</th>
            <th scope="col">Предложено</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.title}</th>
              <td>{row.before}</td>
              <td className="replan-after">{row.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Basis text={state.rationale} />
      {stale && (
        <p className="replan-stale" role="alert">
          Данные изменились после подготовки предложения. Сначала нужно
          пересчитать.
        </p>
      )}
      <div className="replan-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={stale || state.busy}
          onClick={replan.apply}
        >
          Применить изменения
        </button>
        {stale && (
          <button className="button" type="button" onClick={replan.run}>
            Запросить заново
          </button>
        )}
        <button
          className="button"
          type="button"
          disabled={state.busy}
          onClick={replan.keep}
        >
          Оставить текущий порядок
        </button>
      </div>
    </>
  );
}

function Outcome({
  replan,
}: {
  readonly replan: ReplanModel;
}): React.JSX.Element | null {
  const { state } = replan;
  if (state.phase === 'applied')
    return (
      <>
        <p role="status">
          {state.undone ? 'Изменения отменены.' : 'Порядок перестроен.'}
        </p>
        {!state.undone && (
          <button className="button" type="button" onClick={replan.undo}>
            Отменить
          </button>
        )}
      </>
    );
  if (state.phase === 'kept') return <p role="status">Порядок не изменён.</p>;
  if (state.phase === 'cancelled')
    return <p role="status">Запрос отменён. Порядок не изменён.</p>;
  if (state.phase === 'error')
    return (
      <>
        <p role="alert" className="chat-error">
          {state.message}
        </p>
        <button className="button" type="button" onClick={replan.run}>
          Запросить заново
        </button>
      </>
    );
  return null;
}

export function ReplanScreen({
  replan,
  tasks,
  mode,
  loadMode,
}: ReplanScreenProps): React.JSX.Element {
  const { state } = replan;
  React.useEffect(loadMode, [loadMode]);
  return (
    <section className="replan-screen" aria-labelledby="replan-heading">
      <h1 id="replan-heading">Перестроить порядок</h1>
      <div className="replan-card">
        <span className="replan-mode">
          {mode === 'confirm' ? 'С подтверждением' : 'Авто'}
        </span>
        {state.phase === 'idle' && (
          <p>
            Нажмите «Перестроить» в верхней строке: AI предложит порядок, а вы
            увидите, что изменится, до применения.
          </p>
        )}
        {state.phase === 'running' && (
          <p role="status">
            Жду ответ AI…{' '}
            <button className="button" type="button" onClick={replan.cancel}>
              Отменить запрос
            </button>
          </p>
        )}
        <Proposal replan={replan} tasks={tasks} />
        <Outcome replan={replan} />
      </div>
    </section>
  );
}
