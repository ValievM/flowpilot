import React from 'react';

export function BoardLoading(): React.JSX.Element {
  return (
    <section className="simple-screen" aria-busy="true">
      <h1>Доска</h1>
      <p role="status">Загрузка доски…</p>
    </section>
  );
}

export function BoardLoadFailure({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <section className="simple-screen">
      <h1>Доска</h1>
      <p role="alert">{error}</p>
      <button className="button" onClick={onRetry}>
        Повторить
      </button>
    </section>
  );
}
