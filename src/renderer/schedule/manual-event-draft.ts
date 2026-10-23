import { Temporal } from 'temporal-polyfill';
import type { ManualScheduleEvent } from '../../shared/schedule-contracts';

export interface ManualDraft {
  readonly title: string;
  readonly weekdays: readonly number[];
  readonly startTime: string;
  readonly endTime: string;
  readonly place: string;
  readonly fromDate: string;
  readonly throughDate: string;
}

export function emptyDraft(today: Temporal.PlainDate): ManualDraft {
  return {
    title: '',
    weekdays: [],
    startTime: '09:00',
    endTime: '10:30',
    place: '',
    fromDate: today.toString(),
    throughDate: today.add({ days: 120 }).toString(),
  };
}

export function draftOf(event: ManualScheduleEvent): ManualDraft {
  return {
    title: event.title,
    weekdays: event.weekdays,
    startTime: event.startTime,
    endTime: event.endTime,
    place: event.place ?? '',
    fromDate: event.fromDate,
    throughDate: event.throughDate,
  };
}

/** The first thing wrong with a draft, in words; undefined when it can be saved. */
export function draftProblem(draft: ManualDraft): string | undefined {
  if (draft.title.trim() === '') return 'Введите название занятия.';
  if (draft.weekdays.length === 0) return 'Выберите хотя бы один день недели.';
  if (draft.endTime <= draft.startTime)
    return 'Конец занятия должен быть позже начала.';
  if (draft.throughDate < draft.fromDate)
    return 'Последний день не может быть раньше первого.';
  return undefined;
}

type ManualEventInput = Omit<ManualScheduleEvent, 'weekdays'> & {
  weekdays: number[];
};

export function eventOf(draft: ManualDraft, id: string): ManualEventInput {
  const place = draft.place.trim();
  return {
    id,
    title: draft.title.trim(),
    timeZone: Temporal.Now.timeZoneId(),
    ...(place ? { place } : {}),
    weekdays: [...draft.weekdays].sort((left, right) => left - right),
    startTime: draft.startTime,
    endTime: draft.endTime,
    fromDate: draft.fromDate,
    throughDate: draft.throughDate,
  };
}
