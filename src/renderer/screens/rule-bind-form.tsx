import React from 'react';
import type { IpcStoredRule } from '../../shared/rule-contracts';
import { useCatalog } from '../catalog/catalog-context';
import { currentDocument } from '../rules/rules-copy';

interface BindFormProps {
  readonly rule: IpcStoredRule;
  readonly onSave: (scope: {
    task_type_ids: string[];
    discipline_ids: string[];
  }) => Promise<boolean>;
  readonly onClose: () => void;
}

function toggled(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function RuleBindForm({
  rule,
  onSave,
  onClose,
}: BindFormProps): React.JSX.Element {
  const { taskTypes, disciplines } = useCatalog();
  const scope = currentDocument(rule)?.scope;
  const [typeIds, setTypeIds] = React.useState<readonly string[]>(
    scope?.task_type_ids ?? [],
  );
  const [disciplineIds, setDisciplineIds] = React.useState<readonly string[]>(
    scope?.discipline_ids ?? [],
  );
  const save = async (): Promise<void> => {
    const ok = await onSave({
      task_type_ids: taskTypes
        .filter(({ id }) => typeIds.includes(id))
        .map(({ id }) => id),
      discipline_ids: disciplines
        .filter(({ id }) => disciplineIds.includes(id))
        .map(({ id }) => id),
    });
    if (ok) onClose();
  };
  return (
    <div className="rule-bind">
      <fieldset>
        <legend>Типы задач</legend>
        {taskTypes.map((type) => (
          <label key={type.id}>
            <input
              type="checkbox"
              checked={typeIds.includes(type.id)}
              onChange={() => {
                setTypeIds(toggled(typeIds, type.id));
              }}
            />
            {type.name}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Дисциплины (пусто — все)</legend>
        {disciplines.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={disciplineIds.includes(item.id)}
              onChange={() => {
                setDisciplineIds(toggled(disciplineIds, item.id));
              }}
            />
            {item.name}
          </label>
        ))}
      </fieldset>
      <div className="rule-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={() => void save()}
        >
          Сохранить привязку
        </button>
        <button className="button" type="button" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}
