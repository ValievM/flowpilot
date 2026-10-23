import { nativeTheme, type IpcMain } from 'electron';
import { ipcChannels } from '../shared/contracts';
import type { Clock, Repository } from '../storage';
import { applyAppearanceTheme, initializeAppearanceTheme } from './appearance';
import { applyCommands, loadSnapshot } from './handlers';
import type { AiRunner } from './ai/ai-runner';
import type { ManualExchangeProvider } from './ai/manual-exchange-provider';
import {
  createHistoryFileHandlers,
  type HistoryFileHandlers,
} from './history-file-handlers';
import { registerFeatureIpcHandlers } from './ipc-feature-handlers';
import type { RuleFileDependencies } from './rules-handlers';

export type RegistrationDependencies = {
  repository: Repository;
  readonly ruleDialogs: RuleFileDependencies['dialogs'];
  readonly appInfo: {
    getName(): string;
    getVersion(): string;
    getNow(): string;
  };
  readonly aiRunner: AiRunner;
  readonly manualProvider: ManualExchangeProvider;
  readonly onAppearanceReady: () => void;
  readonly onRepositoryReplaced: (repository: Repository) => void;
  readonly dialogs: {
    pickFile(): Promise<string | undefined>;
    pickFolder(): Promise<string | undefined>;
  };
  readonly shell: { open(path: string): Promise<string> };
  readonly profilePath: string;
  readonly clock: Clock;
};

type IpcRegistrar = Pick<IpcMain, 'handle'>;

export function registerIpcHandlers(
  ipc: IpcRegistrar,
  deps: RegistrationDependencies,
): void {
  const historyFiles = createHistoryFileHandlers({
    dialogs: deps.dialogs,
    repositories: {
      current: () => deps.repository,
      replace: (repository) => {
        replaceRepository(repository, deps);
      },
    },
    shell: deps.shell,
    profilePath: deps.profilePath,
    clock: deps.clock,
  });
  registerCoreChannels(ipc, deps);
  registerHistoryFileChannels(ipc, historyFiles);
}

function replaceRepository(
  repository: Repository,
  deps: RegistrationDependencies,
): void {
  deps.repository = repository;
  deps.onRepositoryReplaced(repository);
}

function registerCoreChannels(
  ipc: IpcRegistrar,
  deps: RegistrationDependencies,
): void {
  ipc.handle(ipcChannels.appearanceInitialize, (_event, request: unknown) =>
    initializeAppearanceTheme(request, {
      repository: deps.repository,
      nativeTheme,
    }),
  );
  ipc.handle(ipcChannels.appearanceReady, () => {
    deps.onAppearanceReady();
  });
  ipc.handle(ipcChannels.appearanceSetTheme, (_event, request: unknown) =>
    applyAppearanceTheme(request, {
      repository: deps.repository,
      nativeTheme,
    }),
  );
  ipc.handle(ipcChannels.snapshotLoad, (_event, request: unknown) =>
    loadSnapshot(request, deps),
  );
  ipc.handle(ipcChannels.commandsApply, (_event, request: unknown) =>
    applyCommands(request, deps),
  );
  registerFeatureIpcHandlers(ipc, deps);
}

function registerHistoryFileChannels(
  ipc: IpcRegistrar,
  handlers: HistoryFileHandlers,
): void {
  ipc.handle(ipcChannels.historyList, (_event, request: unknown) =>
    handlers.historyList(request),
  );
  ipc.handle(ipcChannels.historyUndo, (_event, request: unknown) =>
    handlers.historyUndo(request),
  );
  ipc.handle(ipcChannels.attachmentsAdd, (_event, request: unknown) =>
    handlers.attachmentsAdd(request),
  );
  ipc.handle(ipcChannels.attachmentsOpen, (_event, request: unknown) =>
    handlers.attachmentsOpen(request),
  );
  ipc.handle(ipcChannels.attachmentsRemove, (_event, request: unknown) =>
    handlers.attachmentsRemove(request),
  );
  ipc.handle(ipcChannels.backupExport, (_event, request: unknown) =>
    handlers.backupExport(request),
  );
  ipc.handle(ipcChannels.backupVerify, (_event, request: unknown) =>
    handlers.backupVerify(request),
  );
  ipc.handle(ipcChannels.backupRestore, (_event, request: unknown) =>
    handlers.backupRestore(request),
  );
}
