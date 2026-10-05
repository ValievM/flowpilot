import type { IpcMain } from 'electron';
import { ipcChannels } from '../shared/contracts';
import type { Repository } from '../storage/repository';
import {
  applyCommands,
  getAppInfo,
  getSettings,
  loadSnapshot,
  setSetting,
} from './handlers';

type RegistrationDependencies = {
  readonly repository: Repository;
  readonly appInfo: { getName(): string; getVersion(): string };
};

export function registerIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  deps: RegistrationDependencies,
): void {
  ipc.handle(ipcChannels.snapshotLoad, (_event, request: unknown) =>
    loadSnapshot(request, deps),
  );
  ipc.handle(ipcChannels.commandsApply, (_event, request: unknown) =>
    applyCommands(request, deps),
  );
  ipc.handle(ipcChannels.settingsGet, (_event, request: unknown) =>
    getSettings(request, deps),
  );
  ipc.handle(ipcChannels.settingsSet, (_event, request: unknown) =>
    setSetting(request, deps),
  );
  ipc.handle(ipcChannels.appInfo, (_event, request: unknown) =>
    getAppInfo(request, deps.appInfo),
  );
}
