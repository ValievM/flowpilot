import type { FlowPilotApi } from '../../shared/flowpilot-api';

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

export const fakeScheduleApi: FlowPilotApi['schedule'] = {
  list: () => Promise.resolve({ ok: true, value: [] }),
  importFile: () =>
    Promise.resolve({ ok: false, error: { kind: 'Cancelled' } }),
  confirmImport: () =>
    Promise.resolve({ ok: false, error: { kind: 'NotFound' } }),
};
