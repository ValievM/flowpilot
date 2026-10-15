import React from 'react';
import type { IpcSnapshot } from '../../shared/contracts';

type Column = IpcSnapshot['columns'][number];

export function BoardColumnFields({
  editing,
}: {
  editing: Column | undefined;
}): React.JSX.Element {
  const [values, setValues] = React.useState(() => ({
    name: editing?.name ?? '',
    description: editing?.description ?? '',
  }));
  const dirty = React.useRef({ name: false, description: false });
  const previousId = React.useRef(editing?.id);
  React.useEffect(() => {
    if (previousId.current !== editing?.id) {
      previousId.current = editing?.id;
      dirty.current = { name: false, description: false };
      setValues({
        name: editing?.name ?? '',
        description: editing?.description ?? '',
      });
      return;
    }
    setValues((current) => ({
      name: dirty.current.name ? current.name : (editing?.name ?? ''),
      description: dirty.current.description
        ? current.description
        : (editing?.description ?? ''),
    }));
  }, [editing?.description, editing?.id, editing?.name]);
  return (
    <>
      <label htmlFor="column-name">Название</label>
      <input
        id="column-name"
        name="name"
        required
        maxLength={300}
        value={values.name}
        aria-describedby="column-name-help"
        onChange={(event) => {
          dirty.current.name = true;
          setValues((current) => ({ ...current, name: event.target.value }));
        }}
      />
      <p id="column-name-help" className="helper-text">
        Короткое название помогает ориентироваться на доске.
      </p>
      <label htmlFor="column-description">Описание</label>
      <textarea
        id="column-description"
        name="description"
        value={values.description}
        onChange={(event) => {
          dirty.current.description = true;
          setValues((current) => ({
            ...current,
            description: event.target.value,
          }));
        }}
      />
      {!editing && <ColumnStateField />}
    </>
  );
}

function ColumnStateField(): React.JSX.Element {
  return (
    <>
      <label htmlFor="column-state">Смысл состояния</label>
      <select id="column-state" name="state">
        <option value="todo">Сделать</option>
        <option value="doing">Делаю</option>
        <option value="waiting">Ожидание</option>
        <option value="done">Готово</option>
      </select>
    </>
  );
}
