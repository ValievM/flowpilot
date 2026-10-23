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

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
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
