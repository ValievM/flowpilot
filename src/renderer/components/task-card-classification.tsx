import React from 'react';
import type { Task } from '../../domain';
import { useCatalog } from '../catalog/catalog-context';
import {
  kindWords,
  nameProblem,
  type CatalogKind,
} from '../catalog/catalog-names';
import type { PersistedState } from '../use-persisted-tasks';

const CREATE = '__create__';

function ClassifyField({
  kind,
  task,
  onApply,
}: {
  readonly kind: CatalogKind;
  readonly task: Task;
  readonly onApply: PersistedState['applyCard'];
}): React.JSX.Element {
  const catalog = useCatalog();
  const items = kind === 'type' ? catalog.taskTypes : catalog.disciplines;
  const current = kind === 'type' ? task.typeId : task.disciplineId;
  const field = kind === 'type' ? 'typeId' : 'disciplineId';
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [problem, setProblem] = React.useState<string>();
  const words = kindWords[kind];
  const classify = async (value: string | null): Promise<void> => {
    await onApply([{ kind: 'task.classify', taskId: task.id, [field]: value }]);
  };
  const create = async (): Promise<void> => {
    const message = nameProblem(kind, items, name);
    setProblem(message);
    if (message) return;
    const id = crypto.randomUUID();
    const item = { id, name: name.trim() };
    const result = await onApply([
      kind === 'type'
        ? { kind: 'taskType.create', taskType: item }
        : { kind: 'discipline.create', discipline: item },
      { kind: 'task.classify', taskId: task.id, [field]: id },
    ]);
    if (result === 'saved') {
      setCreating(false);
      setName('');
      await catalog.reload();
    }
  };
  return (
    <div className="task-card-field">
      <label>
        {words.label}
        <select
          value={creating ? CREATE : (current ?? '')}
          onChange={(event) => {
            if (event.target.value === CREATE) setCreating(true);
            else {
              setCreating(false);
              void classify(event.target.value || null);
            }
          }}
        >
          <option value="">нет</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
          <option value={CREATE}>Создать новое…</option>
        </select>
      </label>
      {creating && (
        <div className="catalog-create">
          <label>
            {words.newName}
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <button
            className="button"
            type="button"
            onClick={() => void create()}
          >
            Добавить {words.one}
          </button>
          {problem && (
            <p role="alert" className="settings-error">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskCardClassification({
  task,
  onApply,
}: {
  readonly task: Task;
  readonly onApply: PersistedState['applyCard'];
}): React.JSX.Element {
  return (
    <>
      <ClassifyField kind="type" task={task} onApply={onApply} />
      <ClassifyField kind="discipline" task={task} onApply={onApply} />
    </>
  );
}
