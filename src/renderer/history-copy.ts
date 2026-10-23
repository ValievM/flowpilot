import type { IpcHistoryEntry } from '../shared/contracts';

const entityLabels: Readonly<Record<string, string>> = {
  task: 'карточка',
  column: 'колонка',
  setting: 'настройка',
  taskType: 'тип задач',
  discipline: 'дисциплина',
  rule: 'правило',
};

const fieldLabels = {
  title: 'Название',
  status: 'Изменён статус',
  day: 'Изменена дата',
  description: 'Изменено описание',
} as const;

type HistoryRecord = {
  readonly title?: unknown;
  readonly status?: unknown;
  readonly day?: unknown;
  readonly description?: unknown;
};
type ChangeField = keyof typeof fieldLabels;

const changedFields: readonly ChangeField[] = [
  'title',
  'status',
  'day',
  'description',
];

function historyRecord(value: unknown): value is HistoryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function changeField(before: unknown, after: unknown): string | undefined {
  if (!historyRecord(before) || !historyRecord(after)) return undefined;
  const field = changedFields.find((key) => before[key] !== after[key]);
  if (!field) return undefined;
  if (field === 'title' && typeof after.title === 'string')
    return `Название: «${after.title}»`;
  return fieldLabels[field];
}

function taskChange(before: unknown, after: unknown): string | undefined {
  const oldRecord = historyRecord(before) ? before : undefined;
  const newRecord = historyRecord(after) ? after : undefined;
  if (!oldRecord && typeof newRecord?.title === 'string')
    return `Создана: «${newRecord.title}»`;
  if (!newRecord && typeof oldRecord?.title === 'string')
    return `Удалена: «${oldRecord.title}»`;
  return changeField(oldRecord, newRecord);
}

export function historyEntryText(entry: IpcHistoryEntry): string {
  const first = entry.entities[0];
  if (!first) return 'Изменение данных';
  const label = entityLabels[first.kind];
  if (!label) return 'Изменение данных';
  const change =
    first.kind === 'task' ? taskChange(first.before, first.after) : undefined;
  if (change) return `Карточка. ${change}`;
  const capitalizedLabel = `${label[0]?.toLocaleUpperCase('ru-RU') ?? ''}${label.slice(1)}`;
  return `${capitalizedLabel} изменена`;
}

export function historyTaskId(entry: IpcHistoryEntry): string | undefined {
  return entry.entities.find(({ kind }) => kind === 'task')?.id;
}
