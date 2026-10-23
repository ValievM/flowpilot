import React from 'react';
import { useCatalog } from './catalog-context';

/** Names follow the data: undo, restore or an AI change may add or remove catalog items. */
export function useCatalogSync(revision: number): void {
  const { reload } = useCatalog();
  React.useEffect(() => {
    void Promise.resolve().then(reload);
  }, [revision, reload]);
}
