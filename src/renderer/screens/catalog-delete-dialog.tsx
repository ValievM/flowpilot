import React from 'react';
import type { Task } from '../../domain';
import { useCatalog } from '../catalog/catalog-context';
import { kindWords, type CatalogKind } from '../catalog/catalog-names';

const DETACH = '__detach__';

interface RuleScope {
  readonly id: string;
  readonly title: string;
  readonly typeIds: readonly string[];
  readonly disciplineIds: readonly string[];
}

function ruleScopes(value: readonly unknown[]): RuleScope[] {
  return value.flatMap((entry) => {
    const document = (entry as { document?: unknown }).document as
      | {
          id?: string;
          title?: string;
          scope?: { task_type_ids?: string[]; discipline_ids?: string[] };
        }
      | null
      | undefined;
    if (!document?.id) return [];
    return [
      {
        id: document.id,
        title: document.title ?? document.id,
        typeIds: document.scope?.task_type_ids ?? [],
        disciplineIds: document.scope?.discipline_ids ?? [],
      },
    ];
  });
}

function useBoundRules(kind: CatalogKind, id: string): readonly RuleScope[] {
  const [rules, setRules] = React.useState<readonly RuleScope[]>([]);
  React.useEffect(() => {
    void window.flowpilot.rules.list().then((result) => {
      if (result.ok) setRules(ruleScopes(result.value));
    });
  }, []);
  return rules.filter(({ typeIds, disciplineIds }) =>
    (kind === 'type' ? typeIds : disciplineIds).includes(id),
  );
}

interface DeleteDialogProps {
  readonly kind: CatalogKind;
  readonly id: string;
  readonly tasks: readonly Task[];
  readonly onConfirm: (targetId: string | undefined) => void;
  readonly onCancel: () => void;
}

export function CatalogDeleteDialog({
  kind,
  id,
  tasks,
  onConfirm,
  onCancel,
}: DeleteDialogProps): React.JSX.Element {
  const catalog = useCatalog();
  const items = kind === 'type' ? catalog.taskTypes : catalog.disciplines;
  const item = items.find((entry) => entry.id === id);
  const bound = tasks.filter(
    (task) => (kind === 'type' ? task.typeId : task.disciplineId) === id,
  );
  const rules = useBoundRules(kind, id);
  const needsChoice = bound.length > 0 || rules.length > 0;
  const [choice, setChoice] = React.useState('');
  const words = kindWords[kind];
  return (
    <div
      className="catalog-dialog"
      role="dialog"
      aria-label={`Удалить ${words.one} «${item?.name ?? ''}»`}
    >
      <p>Привязано задач: {bound.length}</p>
      {rules.map((rule) => (
        <p key={rule.id} className="settings-error">
          Привязано правило: правило «{rule.title}» станет неактивным, пока его
          не привяжут заново.
        </p>
      ))}
      {needsChoice && (
        <label>
          Что сделать с привязкой
          <select
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value);
            }}
          >
            <option value="">Выберите…</option>
            {items
              .filter((entry) => entry.id !== id)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  Перенести на «{entry.name}»
                </option>
              ))}
            <option value={DETACH}>Снять привязку</option>
          </select>
        </label>
      )}
      <div className="catalog-dialog-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={needsChoice && choice === ''}
          onClick={() => {
            onConfirm(choice && choice !== DETACH ? choice : undefined);
          }}
        >
          Удалить {words.accusative}
        </button>
        <button className="button" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
