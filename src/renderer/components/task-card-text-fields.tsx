import React from 'react';

export function TaskCardTextFields({
  title,
  description,
  riskText,
  riskTitle,
  isRisk,
  onTitleChange,
  onDescriptionChange,
  onTitleBlur,
  onDescriptionBlur,
}: {
  readonly title: string;
  readonly description: string;
  readonly riskText: string | undefined;
  readonly riskTitle: string | undefined;
  readonly isRisk: boolean;
  readonly onTitleChange: (value: string) => void;
  readonly onDescriptionChange: (value: string) => void;
  readonly onTitleBlur: () => void;
  readonly onDescriptionBlur: () => void;
}): React.JSX.Element {
  return (
    <>
      <label htmlFor="task-card-title">Название</label>
      <input
        id="task-card-title"
        autoFocus
        maxLength={300}
        value={title}
        onChange={(event) => {
          onTitleChange(event.target.value);
        }}
        onBlur={onTitleBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {riskText && (
        <p className={`risk-label${isRisk ? ' is-risk' : ''}`}>
          {riskTitle && <strong>{riskTitle}: </strong>}
          {riskText}
        </p>
      )}
      <label htmlFor="task-card-description">Описание</label>
      <textarea
        id="task-card-description"
        maxLength={5000}
        rows={5}
        value={description}
        onChange={(event) => {
          onDescriptionChange(event.target.value);
        }}
        onBlur={onDescriptionBlur}
      />
    </>
  );
}
