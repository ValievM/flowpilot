import type { FlowPilotApi } from '../../shared/contracts';

export const fakeCatalogApi: FlowPilotApi['catalog'] = {
  list: () =>
    Promise.resolve({
      ok: true,
      value: { taskTypes: [], disciplines: [] },
    }),
};

export const fakeRulesApi: FlowPilotApi['rules'] = {
  list: () => Promise.resolve({ ok: true, value: [] }),
  importFile: () =>
    Promise.resolve({ ok: false, error: { kind: 'Cancelled' } }),
  exportFile: () => Promise.resolve({ ok: false, error: { kind: 'NotFound' } }),
  activate: () => Promise.resolve({ ok: false, error: { kind: 'NotFound' } }),
  deactivate: () => Promise.resolve({ ok: false, error: { kind: 'NotFound' } }),
  bind: () => Promise.resolve({ ok: false, error: { kind: 'NotFound' } }),
};
