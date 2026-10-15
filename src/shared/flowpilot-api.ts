import type {
  AiCancelResult,
  AiIpcRequest,
  AiIpcResult,
  AiManualReplyResult,
  AiScenarioRequest,
  AiScenarioResult,
  AppInfo,
  AppearanceInitializeRequest,
  AttachmentAddRequest,
  AttachmentOpenRequest,
  AttachmentRemoveRequest,
  BackupVerifyResult,
  CommandsApplyRequest,
  IpcHistoryEntry,
  IpcSnapshot,
  SettingsSetRequest,
  ThemeChoice,
  ThemeChoiceRequest,
} from './contracts';
import type { Result } from './ipc-result';

export type FlowPilotApi = {
  appearance: {
    initialize(
      request: AppearanceInitializeRequest,
    ): Promise<Result<ThemeChoice>>;
    ready(): Promise<void>;
    setTheme(request: ThemeChoiceRequest): Promise<Result<null>>;
  };
  snapshot: { load(): Promise<Result<IpcSnapshot>> };
  commands: {
    apply(request: CommandsApplyRequest): Promise<Result<IpcSnapshot>>;
  };
  settings: {
    get(): Promise<Result<Readonly<Record<string, unknown>>>>;
    set(request: SettingsSetRequest): Promise<Result<IpcSnapshot>>;
  };
  history: {
    list(
      limit?: number,
      before?: string,
    ): Promise<Result<readonly IpcHistoryEntry[]>>;
    undo(entryId?: string): Promise<Result<IpcSnapshot>>;
  };
  attachments: {
    add(request: AttachmentAddRequest): Promise<Result<IpcSnapshot>>;
    open(request: AttachmentOpenRequest): Promise<Result<null>>;
    remove(request: AttachmentRemoveRequest): Promise<Result<IpcSnapshot>>;
  };
  backup: {
    export(): Promise<Result<null>>;
    verify(): Promise<BackupVerifyResult>;
    restore(packageToken: string): Promise<Result<IpcSnapshot>>;
  };
  ai: {
    run(request: AiIpcRequest): Promise<AiIpcResult>;
    scenario(request: AiScenarioRequest): Promise<AiScenarioResult>;
    cancel(request: { operationId: string }): Promise<AiCancelResult>;
    prompt(request: { operationId: string }): Promise<Result<string>>;
    reply(request: {
      operationId: string;
      text: string;
    }): Promise<AiManualReplyResult>;
  };
  app: {
    info(): Promise<Result<AppInfo>>;
  };
};
