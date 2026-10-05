import { readContent } from './content-lines';
import { expandEvents } from './recurrence';
import type { ParseOptions, ParseResult } from './types';

export function parseIcs(text: string, options: ParseOptions): ParseResult {
  if (!options.defaultTimeZone) {
    return {
      events: [],
      problems: [
        { line: 1, reason: 'Необходимо указать часовой пояс по умолчанию.' },
      ],
    };
  }
  const content = readContent(text);
  if (content.events.length === 0 && content.problems.length === 0) {
    return {
      events: [],
      problems: [{ line: 1, reason: 'В файле не найдено ни одного события.' }],
    };
  }
  const expanded = expandEvents(content.events, options);
  return {
    events: expanded.events,
    problems: [...content.problems, ...expanded.problems],
  };
}
