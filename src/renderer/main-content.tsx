import React from 'react';
import type { AppModel } from './app-model';
import { ScreenContent, type ScreenProps } from './screen-content';

function LoadingState(): React.JSX.Element {
  return (
    <section className="loading-state" role="status">
      <h1>Загружаем сохранённые задачи…</h1>
      <p>Ваши дела появятся здесь после чтения приложения.</p>
    </section>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  readonly error: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <section className="error-state" role="alert">
      <p>{error}</p>
      <button className="button" type="button" onClick={onRetry}>
        Повторить загрузку
      </button>
    </section>
  );
}

function shouldShowLoading(model: AppModel): boolean {
  const { state } = model;
  return (
    (!model.clock.isReady && !model.clock.error) ||
    (state.isLoading && state.tasks.length === 0)
  );
}
export function MainContent({
  model,
  screenProps,
}: {
  readonly model: AppModel;
  readonly screenProps: ScreenProps;
}): React.JSX.Element {
  const { state } = model;
  if (shouldShowLoading(model)) return <LoadingState />;
  if (state.loadError && state.tasks.length === 0)
    return (
      <ErrorState
        error={state.loadError}
        onRetry={() => {
          void state.refresh();
        }}
      />
    );
  return (
    <>
      <ScreenContent {...screenProps} />
      {model.clock.error && (
        <p className="load-error" role="alert">
          {model.clock.error}
          <button className="button" type="button" onClick={model.clock.retry}>
            Повторить получение времени
          </button>
        </p>
      )}
      {state.isLoading && (
        <p className="refresh-status" role="status">
          Обновляем данные…
        </p>
      )}
      {state.loadError && (
        <p className="load-error" role="alert">
          {state.loadError}
          <button
            className="button"
            type="button"
            onClick={() => void state.refresh()}
          >
            Повторить загрузку
          </button>
        </p>
      )}
      {state.commandError && (
        <p className="save-error" role="alert">
          {state.commandError}
        </p>
      )}
    </>
  );
}
