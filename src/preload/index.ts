import type { FlowPilotApi } from '../shared/flowpilot-api';
import { contextBridge, ipcRenderer } from 'electron';
import {
  ipcChannels,
  type AppInfo,
  type AppearanceInitializeRequest,
  type AttachmentAddRequest,
  type AttachmentOpenRequest,
  type AttachmentRemoveRequest,
  type ExportInfo,
  type BackupVerifyResult,
  type CommandsApplyRequest,
  type IpcHistoryEntry,
  type IpcSnapshot,
  type IpcCatalog,
  type IpcStoredRule,
  type IpcRuleResult,
  type RuleIdRequest,
  type RuleBindRequest,
  type SettingsSetRequest,
  type ThemeChoice,
  type ThemeChoiceRequest,
  type AiIpcRequest,
  type AiIpcResult,
  type AiCancelResult,
  type AiManualReplyResult,
  type AiScenarioRequest,
  type AiScenarioResult,
} from '../shared/contracts';
import type { Result } from '../shared/ipc-result';

const api: FlowPilotApi = Object.freeze({
  appearance: {
    initialize: (request: AppearanceInitializeRequest) =>
      ipcRenderer.invoke(ipcChannels.appearanceInitialize, request) as Promise<
        Result<ThemeChoice>
      >,
    ready: () =>
      ipcRenderer.invoke(ipcChannels.appearanceReady, {}) as Promise<void>,
    setTheme: (request: ThemeChoiceRequest) =>
      ipcRenderer.invoke(ipcChannels.appearanceSetTheme, request) as Promise<
        Result<null>
      >,
  },
  snapshot: {
    load: () =>
      ipcRenderer.invoke(ipcChannels.snapshotLoad, {}) as Promise<
        Result<IpcSnapshot>
      >,
  },
  commands: {
    apply: (request: CommandsApplyRequest) =>
      ipcRenderer.invoke(ipcChannels.commandsApply, request) as Promise<
        Result<IpcSnapshot>
      >,
  },
  catalog: {
    list: () =>
      ipcRenderer.invoke(ipcChannels.catalogList, {}) as Promise<
        IpcRuleResult<IpcCatalog>
      >,
  },
  rules: {
    list: () =>
      ipcRenderer.invoke(ipcChannels.rulesList, {}) as Promise<
        IpcRuleResult<readonly IpcStoredRule[]>
      >,
    importFile: () =>
      ipcRenderer.invoke(ipcChannels.rulesImportFile, {}) as Promise<
        IpcRuleResult<IpcStoredRule>
      >,
    exportFile: (request: RuleIdRequest) =>
      ipcRenderer.invoke(ipcChannels.rulesExportFile, request) as Promise<
        IpcRuleResult<null>
      >,
    activate: (request: RuleIdRequest) =>
      ipcRenderer.invoke(ipcChannels.rulesActivate, request) as Promise<
        IpcRuleResult<IpcStoredRule>
      >,
    deactivate: (request: RuleIdRequest) =>
      ipcRenderer.invoke(ipcChannels.rulesDeactivate, request) as Promise<
        IpcRuleResult<IpcStoredRule>
      >,
    bind: (request: RuleBindRequest) =>
      ipcRenderer.invoke(ipcChannels.rulesBind, request) as Promise<
        IpcRuleResult<IpcStoredRule>
      >,
  },
  settings: {
    get: () =>
      ipcRenderer.invoke(ipcChannels.settingsGet, {}) as Promise<
        Result<Readonly<Record<string, unknown>>>
      >,
    set: (request: SettingsSetRequest) =>
      ipcRenderer.invoke(ipcChannels.settingsSet, request) as Promise<
        Result<IpcSnapshot>
      >,
  },
  history: {
    list: (limit = 50, before?: string) =>
      ipcRenderer.invoke(ipcChannels.historyList, { limit, before }) as Promise<
        Result<readonly IpcHistoryEntry[]>
      >,
    undo: (entryId?: string) =>
      ipcRenderer.invoke(ipcChannels.historyUndo, { entryId }) as Promise<
        Result<IpcSnapshot>
      >,
  },
  attachments: {
    add: (request: AttachmentAddRequest) =>
      ipcRenderer.invoke(ipcChannels.attachmentsAdd, request) as Promise<
        Result<IpcSnapshot>
      >,
    open: (request: AttachmentOpenRequest) =>
      ipcRenderer.invoke(ipcChannels.attachmentsOpen, request) as Promise<
        Result<null>
      >,
    remove: (request: AttachmentRemoveRequest) =>
      ipcRenderer.invoke(ipcChannels.attachmentsRemove, request) as Promise<
        Result<IpcSnapshot>
      >,
  },
  backup: {
    export: () =>
      ipcRenderer.invoke(ipcChannels.backupExport, {}) as Promise<
        Result<ExportInfo>
      >,
    verify: () =>
      ipcRenderer.invoke(
        ipcChannels.backupVerify,
        {},
      ) as Promise<BackupVerifyResult>,
    restore: (packageToken: string) =>
      ipcRenderer.invoke(ipcChannels.backupRestore, {
        packageToken,
      }) as Promise<Result<IpcSnapshot>>,
  },
  ai: {
    scenario: (request: AiScenarioRequest) =>
      ipcRenderer.invoke(
        ipcChannels.aiScenario,
        request,
      ) as Promise<AiScenarioResult>,
    run: (request: AiIpcRequest) =>
      ipcRenderer.invoke(ipcChannels.aiRun, request) as Promise<AiIpcResult>,
    cancel: (request: { operationId: string }) =>
      ipcRenderer.invoke(
        ipcChannels.aiCancel,
        request,
      ) as Promise<AiCancelResult>,
    prompt: (request: { operationId: string }) =>
      ipcRenderer.invoke(ipcChannels.aiPrompt, request) as Promise<
        Result<string>
      >,
    reply: (request: { operationId: string; text: string }) =>
      ipcRenderer.invoke(
        ipcChannels.aiReply,
        request,
      ) as Promise<AiManualReplyResult>,
  },
  app: {
    info: () =>
      ipcRenderer.invoke(ipcChannels.appInfo, {}) as Promise<Result<AppInfo>>,
  },
});

contextBridge.exposeInMainWorld('flowpilot', api);
