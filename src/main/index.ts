import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Repository } from '../storage';
import { registerIpcHandlers } from './ipc-handlers';
import { selectRuntimeOptions, selectWindowOptions } from './runtime';
import { initialAppearanceTheme, isTrustedNavigation } from './appearance';
import { ManualExchangeProvider } from './ai/manual-exchange-provider';
import { createStartupAiRunner } from './ai/startup-ai-runner';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | undefined;
let repository: Repository | undefined;
const manualProvider = new ManualExchangeProvider();
const runtime = selectRuntimeOptions(
  app.isPackaged,
  process.env,
  app.getPath('userData'),
);
if (runtime.profilePath !== app.getPath('userData'))
  app.setPath('userData', runtime.profilePath);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  void app
    .whenReady()
    .then(() => {
      mkdirSync(runtime.profilePath, { recursive: true });
      repository = new Repository(
        path.join(runtime.profilePath, 'flowpilot.db'),
        runtime.clock,
      );
      nativeTheme.themeSource = initialAppearanceTheme(
        repository.load().settings,
      );
      const aiRunner = createStartupAiRunner(
        app.isPackaged,
        process.env,
        manualProvider,
      );
      registerIpcHandlers(ipcMain, {
        repository,
        appInfo: {
          getName: () => app.getName(),
          getVersion: () => app.getVersion(),
          getNow: () => runtime.clock.now().toString(),
        },
        aiRunner,
        manualProvider,
      });
      createWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch(() => {
      app.quit();
    });
}

app.on('will-quit', () => repository?.close());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createWindow(): void {
  const windowOptions = selectWindowOptions(runtime.isE2E);
  const applicationAddress = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  mainWindow = new BrowserWindow({
    ...windowOptions,
    width: 1280,
    height: 800,
    minWidth: 900,
    show: false,
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: 20 },
        }
      : {}),
    webPreferences: {
      ...windowOptions.webPreferences,
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const trustedAddress = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : `file://${applicationAddress}`;
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, address) => {
    if (!isTrustedNavigation(address, trustedAddress)) event.preventDefault();
  });
  mainWindow.on('enter-full-screen', () => {
    setFullScreenState(true);
  });
  mainWindow.on('leave-full-screen', () => {
    setFullScreenState(false);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(applicationAddress);
  }
  if (!runtime.isE2E)
    mainWindow.once('ready-to-show', () => mainWindow?.show());
}

function setFullScreenState(isFullScreen: boolean): void {
  if (mainWindow?.isDestroyed()) return;
  void mainWindow?.webContents.executeJavaScript(
    `document.documentElement.toggleAttribute('data-full-screen', ${String(isFullScreen)})`,
  );
}
