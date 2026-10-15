import React from 'react';
import { Temporal } from 'temporal-polyfill';
import { skipGroups } from '../../domain/repeats';
import type { Outcome, Series } from '../../domain';
import type { CommandsApplyRequest } from '../../shared/contracts';

type OutcomeInput = Extract<
  CommandsApplyRequest['commands'][number],
  { kind: 'series.recordOutcome' }
>['outcome'];

interface MissedGroupsProps {
  readonly series: readonly Series[];
  readonly outcomes: readonly Outcome[];
  readonly today: Temporal.PlainDate;
  readonly onOutcome: (seriesId: string, outcome: OutcomeInput) => void;
}

export function MissedGroups({
  series,
  outcomes,
  today,
  onOutcome,
}: MissedGroupsProps): React.JSX.Element | null {
  const groups = skipGroups(series, outcomes, today);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(
    new Set(),
  );
  if (groups.length === 0) return null;
  return (
    <section className="missed-repeats" aria-labelledby="missed-repeats-title">
      <h2 id="missed-repeats-title">Пропуски</h2>
      <ul>
        {groups.map((group) => {
          const item = series.find(({ id }) => id === group.seriesId);
          if (!item) return null;
          const isExpanded = expanded.has(group.seriesId);
          return (
            <li className="missed-repeat-group" key={group.seriesId}>
              <button
                className="missed-repeat-toggle"
                type="button"
                aria-expanded={isExpanded}
                onClick={() => {
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(group.seriesId)) next.delete(group.seriesId);
                    else next.add(group.seriesId);
                    return next;
                  });
                }}
              >
                {item.title} ×{group.count}
              </button>
              {isExpanded && (
                <ul>
                  {group.dates.map((date) => (
                    <li className="missed-repeat-date" key={date.toString()}>
                      <span>
                        {date.toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}{' '}
                        · Пропуск
                      </span>
                      <button
                        className="button"
                        type="button"
                        onClick={() => {
                          onOutcome(item.id, { kind: 'done', date });
                        }}
                      >
                        Отметить выполненным
                      </button>
                      <button
                        className="button"
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Закрыть пропуск «${item.title}» за ${date.toString()}?`,
                            )
                          )
                            onOutcome(item.id, { kind: 'dismissed', date });
                        }}
                      >
                        Закрыть
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
