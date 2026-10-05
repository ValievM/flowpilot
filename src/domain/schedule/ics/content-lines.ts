import type { IcsEvent, IcsProperty, ParseProblem } from './types';

export const MAX_FILE_SIZE = 1_048_576;
export const MAX_EVENTS = 5_000;

export interface ContentResult {
  readonly events: readonly IcsEvent[];
  readonly problems: readonly ParseProblem[];
}

interface ContentState {
  readonly events: IcsEvent[];
  readonly problems: ParseProblem[];
  active: IcsProperty[] | undefined;
  eventLine: number;
}

interface SourceLine {
  readonly value: string;
  readonly line: number;
}

function unfold(text: string): SourceLine[] {
  const physical = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const output: SourceLine[] = [];
  physical.forEach((value, index) => {
    if (/^[ \t]/.test(value) && output.length > 0) {
      const prior = output[output.length - 1];
      if (prior)
        output[output.length - 1] = {
          ...prior,
          value: prior.value + value.slice(1),
        };
    } else {
      output.push({ value, line: index + 1 });
    }
  });
  return output;
}

function splitProperty(
  line: string,
  lineNumber: number,
): IcsProperty | undefined {
  let quote = false;
  let separator = -1;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quote = !quote;
    if (line[index] === ':' && !quote) {
      separator = index;
      break;
    }
  }
  if (separator < 1) return undefined;
  const [rawName, ...rawParams] = line.slice(0, separator).split(';');
  const params = Object.fromEntries(
    rawParams.map((entry) => {
      const [key, ...values] = entry.split('=');
      return [
        (key ?? '').toUpperCase(),
        values.join('=').replace(/^"|"$/g, ''),
      ];
    }),
  );
  return {
    name: (rawName ?? '').toUpperCase(),
    params,
    value: line.slice(separator + 1),
    line: lineNumber,
  };
}

function openEvent(state: ContentState, line: number): void {
  if (state.active) {
    state.problems.push({
      line,
      reason: 'Вложенное событие не поддерживается.',
    });
    return;
  }
  state.active = [];
  state.eventLine = line;
}

function closeEvent(state: ContentState, line: number): void {
  if (!state.active) {
    state.problems.push({
      line,
      reason: 'Завершено событие, которое не было начато.',
    });
    return;
  }
  state.events.push({ properties: state.active, line: state.eventLine });
  state.active = undefined;
  if (state.events.length > MAX_EVENTS) {
    state.events.length = MAX_EVENTS;
    state.problems.push({
      line,
      reason: 'Превышено ограничение в 5000 событий.',
    });
  }
}

function consumeLine(state: ContentState, source: SourceLine): void {
  if (!source.value) return;
  const property = splitProperty(source.value, source.line);
  if (!property) {
    state.problems.push({
      line: source.line,
      reason: 'Строка календаря имеет неверный формат.',
    });
    return;
  }
  if (property.name === 'BEGIN' && property.value.toUpperCase() === 'VEVENT') {
    openEvent(state, source.line);
  } else if (
    property.name === 'END' &&
    property.value.toUpperCase() === 'VEVENT'
  ) {
    closeEvent(state, source.line);
  } else if (state.active) {
    state.active.push(property);
  }
}

export function readContent(text: string): ContentResult {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_SIZE) {
    return {
      events: [],
      problems: [{ line: 1, reason: 'Файл превышает ограничение 1 МБ.' }],
    };
  }
  const state: ContentState = {
    events: [],
    problems: [],
    active: undefined,
    eventLine: 1,
  };
  for (const source of unfold(text)) consumeLine(state, source);
  if (state.active)
    state.problems.push({
      line: state.eventLine,
      reason: 'Событие не завершено.',
    });
  return { events: state.events, problems: state.problems };
}

export function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_match, character: string) =>
    character.toLowerCase() === 'n' ? '\n' : character,
  );
}
