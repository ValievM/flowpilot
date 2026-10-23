const fieldLabels: Readonly<Record<string, string>> = {
  title: 'Название',
  description: 'Описание',
  day: 'День',
  time: 'Время',
  deadline: 'Срок',
  columnId: 'Колонка',
  status: 'Статус',
  aiRank: 'Порядок',
  subtasks: 'Подзадачи',
  comments: 'Комментарии',
};

export function fieldLabel(field: string): string {
  return fieldLabels[field] ?? field;
}

const statusLabels: Readonly<Record<string, string>> = {
  todo: 'Сделать',
  doing: 'Делаю',
  waiting: 'Ожидание',
  done: 'Готово',
};

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function statusText(value: { kind?: unknown; reason?: unknown }): string {
  const label = statusLabels[String(value.kind)] ?? String(value.kind);
  return typeof value.reason === 'string' && value.reason !== ''
    ? `${label}: ${value.reason}`
    : label;
}

function listText(items: readonly unknown[]): string {
  return items
    .map((item) => {
      if (item && typeof item === 'object') {
        const { title, text } = item as { title?: unknown; text?: unknown };
        if (typeof title === 'string') return title;
        if (typeof text === 'string') return text;
      }
      return formatValue(item);
    })
    .join('; ');
}

function textValue(value: string): string {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return date ? `${date[3] ?? ''}.${date[2] ?? ''}.${date[1] ?? ''}` : value;
}

export function formatValue(value: unknown): string {
  if (isEmpty(value)) return '—';
  if (typeof value === 'string') return textValue(value);
  if (Array.isArray(value)) return listText(value);
  if (typeof value === 'object' && value !== null)
    return 'kind' in value ? statusText(value) : JSON.stringify(value);
  return String(value);
}

function valueText(field: string, value: unknown): string {
  return field === 'columnId' && typeof value === 'string'
    ? (statusLabels[value] ?? value)
    : formatValue(value);
}

export interface ChangeRow {
  readonly key: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

const internalFields = new Set(['id', 'attachments', 'addedOrder']);
const defaultsOfNewCard = new Set(['columnId', 'status', 'comments']);

/** Turns raw field changes into the rows a person wants to read. */
export function describeChanges(
  changes: readonly {
    readonly commandIndex: number;
    readonly field: string;
    readonly before: unknown;
    readonly after: unknown;
  }[],
): ChangeRow[] {
  return changes
    .filter(({ field, before, after }) => {
      if (internalFields.has(field) || (isEmpty(after) && isEmpty(before)))
        return false;
      return !(isEmpty(before) && defaultsOfNewCard.has(field));
    })
    .map((change) => ({
      key: `${change.commandIndex.toString()}-${change.field}`,
      label: fieldLabel(change.field),
      before: valueText(change.field, change.before),
      after: valueText(change.field, change.after),
    }));
}

const errorCopy: Readonly<Record<string, string>> = {
  ProviderUnavailable:
    'AI сейчас недоступен. Данные не изменены. Попробуйте ещё раз позже.',
  InvalidReply:
    'Ответ AI не удалось разобрать. Данные не изменены. Отправьте запрос ещё раз.',
  StaleProposal:
    'Данные изменились, пока AI отвечал. Предложение не применено. Повторите запрос.',
  InvalidProposal:
    'Предложение AI имеет неверный формат и не применено. Данные не изменены.',
  ApplyFailed: 'Не удалось применить изменения. Данные не изменены.',
  NotPending: 'Это предложение уже закрыто. Повторите запрос.',
  AlreadyRunning: 'Такой запрос уже выполняется.',
  Aborted: 'Запрос отменён. Данные не изменены.',
};

export function errorText(kind: string): string {
  return errorCopy[kind] ?? 'Не удалось выполнить запрос. Данные не изменены.';
}

export function rejectedReasonText(reason: string): string {
  return reason === 'invalid-command'
    ? 'команда имеет неверный формат'
    : reason;
}
