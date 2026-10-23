// Not the domain barrel: it also loads the Ajv rules schema, which the renderer's CSP forbids.
import { addDiscipline } from '../../domain/disciplines';
import { addType } from '../../domain/task-types';

export type CatalogKind = 'type' | 'discipline';

interface Named {
  readonly id: string;
  readonly name: string;
}

const messages = {
  'empty-name': 'Введите название.',
  'duplicate-name': 'Такое название уже есть.',
} as const;

/** Name checks live in the domain; this only words the answer. */
export function nameProblem(
  kind: CatalogKind,
  catalog: readonly Named[],
  name: string,
  exceptId?: string,
): string | undefined {
  const others = exceptId
    ? catalog.filter(({ id }) => id !== exceptId)
    : catalog;
  const result =
    kind === 'type'
      ? addType(others, 'check', name)
      : addDiscipline(others, 'check', name);
  if (result.ok) return undefined;
  return result.error === 'empty-name' || result.error === 'duplicate-name'
    ? messages[result.error]
    : 'Название не подходит.';
}

export const kindWords = {
  type: {
    one: 'тип',
    accusative: 'тип',
    newName: 'Название нового типа',
    label: 'Тип',
  },
  discipline: {
    one: 'дисциплину',
    accusative: 'дисциплину',
    newName: 'Название новой дисциплины',
    label: 'Дисциплина',
  },
} as const;
