import React from 'react';
import { useCatalog } from './catalog/catalog-context';
import { useSchedule } from './schedule/schedule-context';

/** Names and classes follow the data: undo, restore or an import may change them. */
export function useReferenceSync(revision: number): void {
  const catalog = useCatalog();
  const schedule = useSchedule();
  const { reload: reloadCatalog } = catalog;
  const { reload: reloadSchedule } = schedule;
  React.useEffect(() => {
    void Promise.resolve().then(reloadCatalog);
    void Promise.resolve().then(reloadSchedule);
  }, [revision, reloadCatalog, reloadSchedule]);
}
