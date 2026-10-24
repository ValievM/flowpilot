import { type IpcMain } from 'electron';
import { Temporal } from 'temporal-polyfill';
import { ipcChannels } from '../shared/contracts';
import type { Clock, Repository } from '../storage';
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
import {
  confirmIcsImport,
  createPendingImports,
  listSchedule,
  previewIcsFile,
  type ScheduleDependencies,
} from './schedule-handlers';
import {
  configureNotifications,
  getNotificationsStatus,
} from './notifications/handlers';
import type { ReminderDeps } from './notifications/reminder-service';

type FeatureDependencies = {
  readonly repository: Repository;
  readonly ruleDialogs: RuleFileDependencies['dialogs'];
  readonly scheduleDialogs: ScheduleDependencies['dialogs'];
  readonly reminders: Pick<ReminderDeps, 'adapter' | 'openTarget'>;
  readonly clock: Clock;
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
  registerScheduleHandlers(ipc, deps);
  registerNotificationHandlers(ipc, deps);
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

function registerScheduleHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  deps: FeatureDependencies,
): void {
  const scheduleDeps: ScheduleDependencies = {
    get repository() {
      return deps.repository;
    },
    dialogs: deps.scheduleDialogs,
    clock: deps.clock,
    timeZone: Temporal.Now.timeZoneId(),
    pending: createPendingImports(),
  };
  ipc.handle(ipcChannels.scheduleList, (_event, request: unknown) =>
    listSchedule(request, scheduleDeps),
  );
  ipc.handle(ipcChannels.scheduleImportFile, (_event, request: unknown) =>
    previewIcsFile(request, scheduleDeps),
  );
  ipc.handle(ipcChannels.scheduleConfirmImport, (_event, request: unknown) =>
    confirmIcsImport(request, scheduleDeps),
  );
}

function registerNotificationHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  deps: FeatureDependencies,
): void {
  const reminderDeps: ReminderDeps = {
    get repository() {
      return deps.repository;
    },
    adapter: deps.reminders.adapter,
    clock: deps.clock,
    timeZone: Temporal.Now.timeZoneId(),
    openTarget: deps.reminders.openTarget,
  };
  ipc.handle(ipcChannels.notificationsStatus, (_event, request: unknown) =>
    getNotificationsStatus(request, reminderDeps),
  );
  ipc.handle(ipcChannels.notificationsConfigure, (_event, request: unknown) =>
    configureNotifications(request, reminderDeps),
  );
}
