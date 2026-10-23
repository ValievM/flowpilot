import { type IpcMain } from 'electron';
import { ipcChannels } from '../shared/contracts';
import type { Repository } from '../storage';
import type { AiRunner } from './ai/ai-runner';
import {
  cancelAiRequest,
  getManualPrompt,
  listManualExchanges,
  runAiRequest,
  submitManualReply,
} from './ai/ipc';
import type { ManualExchangeProvider } from './ai/manual-exchange-provider';
import { runAiScenario } from './ai/scenario-ipc';
import type { AiUseCases } from './ai/usecases';
import {
  activateRule,
  bindRule,
  deactivateRule,
  exportRuleFile,
  importRuleFile,
  listCatalogs,
  listRules,
  type RuleFileDependencies,
} from './rules-handlers';
import { getAppInfo, getSettings, setSetting } from './handlers';

type FeatureDependencies = {
  readonly repository: Repository;
  readonly ruleDialogs: RuleFileDependencies['dialogs'];
  readonly appInfo: {
    getName(): string;
    getVersion(): string;
    getNow(): string;
  };
  readonly aiRunner: AiRunner;
  readonly manualProvider: ManualExchangeProvider;
  readonly aiUseCases: AiUseCases;
};

export function registerFeatureIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  deps: FeatureDependencies,
): void {
  // The repository is replaced after a restore, so read it at call time.
  const ruleDeps: RuleFileDependencies = {
    get repository() {
      return deps.repository;
    },
    dialogs: deps.ruleDialogs,
  };
  registerRulesHandlers(ipc, ruleDeps);
  ipc.handle(ipcChannels.settingsGet, (_event, request: unknown) =>
    getSettings(request, deps),
  );
  ipc.handle(ipcChannels.settingsSet, (_event, request: unknown) =>
    setSetting(request, deps),
  );
  ipc.handle(ipcChannels.appInfo, (_event, request: unknown) =>
    getAppInfo(request, deps.appInfo),
  );
  ipc.handle(ipcChannels.aiRun, (_event, request: unknown) =>
    runAiRequest(request, deps.aiRunner, deps.repository.load()),
  );
  ipc.handle(ipcChannels.aiCancel, (_event, request: unknown) =>
    cancelAiRequest(request, deps.aiRunner),
  );
  ipc.handle(ipcChannels.aiPrompt, (_event, request: unknown) =>
    getManualPrompt(request, deps.manualProvider),
  );
  ipc.handle(ipcChannels.aiPending, () =>
    listManualExchanges(deps.manualProvider),
  );
  ipc.handle(ipcChannels.aiReply, (_event, request: unknown) =>
    submitManualReply(request, deps.manualProvider),
  );
  ipc.handle(ipcChannels.aiScenario, (_event, request: unknown) =>
    runAiScenario(request, deps.aiUseCases),
  );
}
function registerRulesHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  deps: RuleFileDependencies,
): void {
  ipc.handle(ipcChannels.catalogList, (_event, request: unknown) =>
    listCatalogs(request, deps),
  );
  ipc.handle(ipcChannels.rulesList, (_event, request: unknown) =>
    listRules(request, deps),
  );
  ipc.handle(ipcChannels.rulesImportFile, (_event, request: unknown) =>
    importRuleFile(request, deps),
  );
  ipc.handle(ipcChannels.rulesExportFile, (_event, request: unknown) =>
    exportRuleFile(request, deps),
  );
  ipc.handle(ipcChannels.rulesActivate, (_event, request: unknown) =>
    activateRule(request, deps),
  );
  ipc.handle(ipcChannels.rulesDeactivate, (_event, request: unknown) =>
    deactivateRule(request, deps),
  );
  ipc.handle(ipcChannels.rulesBind, (_event, request: unknown) =>
    bindRule(request, deps),
  );
}
