import React from 'react';
import type { Task } from '../../domain';
import type { CommandsApplyRequest } from '../../shared/contracts';
import { useCatalog } from '../catalog/catalog-context';
import {
  kindWords,
  nameProblem,
  type CatalogKind,
} from '../catalog/catalog-names';
import { CatalogDeleteDialog } from './catalog-delete-dialog';

type Commands = CommandsApplyRequest['commands'];

interface CatalogSettingsProps {
  readonly tasks: readonly Task[];
  readonly onApply: (commands: Commands) => Promise<boolean>;
}

type Item = { readonly id: string; readonly name: string };

function CatalogList({
  kind,
  items,
  tasks,
  onApply,
}: {
  readonly kind: CatalogKind;
  readonly items: readonly Item[];
  readonly tasks: readonly Task[];
  readonly onApply: CatalogSettingsProps['onApply'];
}): React.JSX.Element {
  const { reload } = useCatalog();
  const words = kindWords[kind];
  const prefix = kind === 'type' ? 'taskType' : 'discipline';
  const [newName, setNewName] = React.useState('');
  const [editing, setEditing] = React.useState<string>();
  const [draft, setDraft] = React.useState('');
  const [deleting, setDeleting] = React.useState<string>();
  const [problem, setProblem] = React.useState<string>();
  const run = async (commands: Commands): Promise<boolean> => {
    const saved = await onApply(commands);
    if (saved) await reload();
    else setProblem('Не удалось сохранить. Попробуйте ещё раз.');
    return saved;
  };
  const add = async (): Promise<void> => {
    const message = nameProblem(kind, items, newName);
    setProblem(message);
    if (message) return;
    const created = { id: crypto.randomUUID(), name: newName.trim() };
    const saved = await run([
      kind === 'type'
        ? { kind: 'taskType.create', taskType: created }
        : { kind: 'discipline.create', discipline: created },
    ]);
    if (saved) setNewName('');
  };
  const rename = async (id: string): Promise<void> => {
    const message = nameProblem(kind, items, draft, id);
    setProblem(message);
    if (message) return;
    const saved = await run([
      { kind: `${prefix}.rename`, id, name: draft.trim() },
    ]);
    if (saved) setEditing(undefined);
  };
  const remove = async (
    id: string,
    targetId: string | undefined,
  ): Promise<void> => {
    const saved = await run([
      { kind: `${prefix}.delete`, id, ...(targetId ? { targetId } : {}) },
    ]);
    if (saved) setDeleting(undefined);
  };
  return (
    <div className="catalog-list">
      <h3>{kind === 'type' ? 'Типы' : 'Дисциплины'}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {editing === item.id ? (
              <>
                <label>
                  Новое название
                  <input
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                    }}
                  />
                </label>
                <button
                  className="button"
                  type="button"
                  onClick={() => void rename(item.id)}
                >
                  Сохранить название
                </button>
              </>
            ) : (
              <>
                <span>{item.name}</span>
                <button
                  className="button"
                  type="button"
                  aria-label={`Переименовать: ${item.name}`}
                  onClick={() => {
                    setEditing(item.id);
                    setDraft(item.name);
                    setProblem(undefined);
                  }}
                >
                  Переименовать
                </button>
                <button
                  className="button"
                  type="button"
                  aria-label={`Удалить: ${item.name}`}
                  onClick={() => {
                    setDeleting(item.id);
                  }}
                >
                  Удалить
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {deleting && (
        <CatalogDeleteDialog
          kind={kind}
          id={deleting}
          tasks={tasks}
          onConfirm={(targetId) => void remove(deleting, targetId)}
          onCancel={() => {
            setDeleting(undefined);
          }}
        />
      )}
      <div className="catalog-create">
        <label>
          {kind === 'type' ? 'Новый тип' : 'Новая дисциплина'}
          <input
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
            }}
          />
        </label>
        <button className="button" type="button" onClick={() => void add()}>
          Добавить {words.one}
        </button>
      </div>
      {problem && (
        <p role="alert" className="settings-error">
          {problem}
        </p>
      )}
    </div>
  );
}

export function CatalogSettings({
  tasks,
  onApply,
}: CatalogSettingsProps): React.JSX.Element {
  const { taskTypes, disciplines } = useCatalog();
  return (
    <section className="settings-card" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading">Типы и дисциплины</h2>
      <CatalogList
        kind="type"
        items={taskTypes}
        tasks={tasks}
        onApply={onApply}
      />
      <CatalogList
        kind="discipline"
        items={disciplines}
        tasks={tasks}
        onApply={onApply}
      />
    </section>
  );
}
