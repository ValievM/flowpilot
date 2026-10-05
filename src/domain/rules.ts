import Ajv, { type ErrorObject } from 'ajv';
import { RULES_SCHEMA_V1 } from './rules-schema-v1';

export interface PriorityRule {
  readonly id: string;
  readonly kind: 'priority';
  readonly level: 'high' | 'normal' | 'low';
  readonly reason: string;
}

export interface TimeWindowRule {
  readonly id: string;
  readonly kind: 'time_window';
  readonly mode: 'allowed' | 'forbidden' | 'preferred';
  readonly days: readonly Weekday[];
  readonly start: string;
  readonly end: string;
  readonly time_zone: string;
}

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface RulesDocument {
  readonly schema_version: 'v1';
  readonly id: string;
  readonly title: string;
  readonly scope: {
    readonly task_type_ids: readonly string[];
    readonly discipline_ids?: readonly string[];
  };
  readonly rules: readonly (PriorityRule | TimeWindowRule)[];
  readonly guidance?: string;
}

export interface RulesValidationError {
  readonly path: string;
  readonly code: string;
  readonly reason: string;
  readonly suggestion: string;
}

export type RulesValidationResult =
  | { readonly ok: true; readonly document: RulesDocument }
  | { readonly ok: false; readonly errors: readonly RulesValidationError[] };

export type RulesJsonResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: 'invalid-json';
        readonly reason: string;
        readonly suggestion: string;
        readonly position: number;
      };
    };

const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(RULES_SCHEMA_V1);

export function validateRulesDocument(json: unknown): RulesValidationResult {
  const isValid = validateSchema(json);
  if (!isValid) {
    return {
      ok: false,
      errors: (validateSchema.errors ?? []).map(toValidationError),
    };
  }

  // Ajv has checked every field and variant against the v1 schema above.
  const document = json as RulesDocument;
  const errors = checkRuleSemantics(document);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, document };
}

export function parseRulesJson(text: string): RulesJsonResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    const message = error instanceof SyntaxError ? error.message : '';
    const position = Number(
      message.match(/position (\d+)/i)?.[1] ?? text.length,
    );
    return {
      ok: false,
      error: {
        code: 'invalid-json',
        reason:
          'Не удалось разобрать JSON: проверьте кавычки, скобки и запятые.',
        suggestion: 'Исправьте синтаксис JSON около указанной позиции.',
        position,
      },
    };
  }
}

function checkRuleSemantics(document: RulesDocument): RulesValidationError[] {
  const errors: RulesValidationError[] = [];
  const ids = new Set<string>();
  document.rules.forEach((rule, index) => {
    if (ids.has(rule.id)) {
      errors.push(semanticError(`rules[${String(index)}].id`, 'duplicate-id'));
    }
    ids.add(rule.id);
    if (rule.kind === 'time_window')
      errors.push(...checkTimeWindow(rule, index));
  });
  return errors;
}

function checkTimeWindow(
  rule: TimeWindowRule,
  index: number,
): RulesValidationError[] {
  const errors: RulesValidationError[] = [];
  if (rule.start >= rule.end)
    errors.push(
      semanticError(`rules[${String(index)}].end`, 'invalid-interval'),
    );
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: rule.time_zone }).format(0);
  } catch {
    errors.push(
      semanticError(`rules[${String(index)}].time_zone`, 'invalid-time-zone'),
    );
  }
  return errors;
}

function toValidationError(error: ErrorObject): RulesValidationError {
  const path = error.instancePath
    .split('/')
    .filter(Boolean)
    .reduce(
      (result, part) =>
        `${result}${/^\d+$/.test(part) ? `[${part}]` : `.${part}`}`,
      '',
    )
    .replace(/^\./, '');
  if (error.keyword === 'additionalProperties') {
    const property = String(error.params.additionalProperty);
    return {
      path: path ? `${path}.${property}` : property,
      code: 'additionalProperties',
      reason: `Поле «${property}» не предусмотрено форматом правил.`,
      suggestion: 'Удалите поле или проверьте его написание по формату v1.',
    };
  }
  if (error.keyword === 'required') {
    const property = String(error.params.missingProperty);
    return {
      path: path ? `${path}.${property}` : property,
      code: 'required',
      reason: `Не заполнено обязательное поле «${property}».`,
      suggestion: 'Добавьте это поле согласно формату v1.',
    };
  }
  const keyword = error.keyword === 'const' ? 'enum' : error.keyword;
  return {
    path,
    code: keyword,
    reason: validationReason(error),
    suggestion: validationSuggestion(error),
  };
}

function validationReason(error: ErrorObject): string {
  if (error.keyword === 'enum' || error.keyword === 'const') {
    return 'Значение не входит в список допустимых для этого поля.';
  }
  if (error.keyword === 'minLength') return 'Значение не может быть пустым.';
  if (error.keyword === 'minItems')
    return 'Список должен содержать хотя бы один элемент.';
  if (error.keyword === 'pattern')
    return 'Время должно быть в формате HH:MM от 00:00 до 23:59.';
  if (error.keyword === 'type') return 'Значение имеет неверный тип.';
  return 'Значение не соответствует формату документа правил v1.';
}

function validationSuggestion(error: ErrorObject): string {
  if (error.keyword === 'enum' || error.keyword === 'const') {
    return `Выберите одно из значений: ${String(error.params.allowedValues ?? 'v1')}.`;
  }
  if (error.keyword === 'pattern')
    return 'Укажите существующее время суток, например 09:30.';
  if (error.keyword === 'minLength') return 'Введите непустое значение.';
  if (error.keyword === 'minItems') return 'Добавьте хотя бы один элемент.';
  return 'Сверьте значение с описанием поля в формате правил v1.';
}

function semanticError(path: string, code: string): RulesValidationError {
  if (code === 'duplicate-id') {
    return {
      path,
      code,
      reason: 'Идентификатор правила повторяется в этом документе.',
      suggestion: 'Задайте каждому правилу уникальный id.',
    };
  }
  if (code === 'invalid-interval') {
    return {
      path,
      code,
      reason: 'Начало интервала должно быть раньше его окончания.',
      suggestion:
        'Используйте непустой интервал; переход через полночь задайте двумя интервалами.',
    };
  }
  return {
    path,
    code,
    reason: 'Часовой пояс не распознан как зона IANA.',
    suggestion: 'Укажите существующую зону, например Europe/Moscow.',
  };
}
