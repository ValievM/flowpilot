import React from 'react';
import type { Discipline, TaskType } from '../../domain/task';

export interface CatalogValue {
  readonly taskTypes: readonly TaskType[];
  readonly disciplines: readonly Discipline[];
  readonly reload: () => Promise<void>;
}

export const CatalogContext = React.createContext<CatalogValue>({
  taskTypes: [],
  disciplines: [],
  reload: () => Promise.resolve(),
});

export function useCatalog(): CatalogValue {
  return React.useContext(CatalogContext);
}

/** Read-only for screens: names only, loaded on request, never required to show tasks. */
export function CatalogProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [catalog, setCatalog] = React.useState<
    Pick<CatalogValue, 'taskTypes' | 'disciplines'>
  >({ taskTypes: [], disciplines: [] });
  const reload = React.useCallback(async (): Promise<void> => {
    try {
      const result = await window.flowpilot.catalog.list();
      if (result.ok)
        setCatalog({
          taskTypes: result.value.taskTypes,
          disciplines: result.value.disciplines,
        });
    } catch {
      // A missing catalog only hides labels; tasks stay usable.
    }
  }, []);
  React.useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);
  const value = React.useMemo(
    () => ({ ...catalog, reload }),
    [catalog, reload],
  );
  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

/** The discipline as text. An unknown id shows nothing: internal ids never reach the screen. */
export function DisciplineTag({
  id,
}: {
  readonly id: string | undefined;
}): React.JSX.Element | null {
  const { disciplines } = useCatalog();
  const discipline = id
    ? disciplines.find((item) => item.id === id)
    : undefined;
  if (!discipline) return null;
  return (
    <span className={`discipline-tag is-${discipline.color ?? 'none'}`}>
      {discipline.name}
    </span>
  );
}
