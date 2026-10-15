import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Repository } from '../storage';
import { registerIpcHandlers } from './ipc-handlers';
import { selectRuntimeOptions, selectWindowOptions } from './runtime';
import { initialAppearanceTheme, isTrustedNavigation } from './appearance';
import { ManualExchangeProvider } from './ai/manual-exchange-provider';
import { createStartupAiRunner } from './ai/startup-ai-runner';
import { createAiUseCases } from './ai/usecases/startup';
import {
  createWindowStartupGate,
  type WindowStartupGate,
} from './window-startup';
import { reportStartupFailure } from './startup-error';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | undefined;
let repository: Repository | undefined;
const WINDOW_STARTUP_FALLBACK_MS = 10_000;
let windowStartupGate: WindowStartupGate | undefined;
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
    if (!windowStartupGate?.isReady()) return;
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
      const aiUseCases = createAiUseCases(repository, aiRunner, runtime.clock);
      registerIpcHandlers(ipcMain, {
        repository,
        appInfo: {
          getName: () => app.getName(),
          getVersion: () => app.getVersion(),
          getNow: () => runtime.clock.now().toString(),
        },
        aiRunner,
        aiUseCases,
        manualProvider,
        onAppearanceReady: () => windowStartupGate?.ready(),
      });
      createWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error: unknown) => {
      reportStartupFailure(error, {
        logFailure: (code) => {
          console.error(`[FlowPilot] Startup failed: ${code}`);
        },
        showErrorBox: (title, message) => {
          dialog.showErrorBox(title, message);
        },
        quit: () => {
          app.quit();
        },
      });
    });
}

app.on('will-quit', () => {
  windowStartupGate?.stop();
  repository?.close();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createWindow(): void {
  windowStartupGate?.stop();
  const address = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  const windowOptions = selectWindowOptions(runtime.isE2E);
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
  configureWindowNavigation(mainWindow, address);
  configureWindowInteractions(mainWindow);
  configureWindowStartup(mainWindow);
  loadWindow(mainWindow, address);
}

function configureWindowNavigation(
  window: BrowserWindow,
  address: string,
): void {
  const trustedAddress = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : `file://${address}`;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    if (!isTrustedNavigation(target, trustedAddress)) event.preventDefault();
  });
}

function configureWindowInteractions(window: BrowserWindow): void {
  window.on('enter-full-screen', () => {
    setFullScreenState(true);
  });
  window.on('leave-full-screen', () => {
    setFullScreenState(false);
  });
}

function configureWindowStartup(window: BrowserWindow): void {
  windowStartupGate = createWindowStartupGate({
    reveal: () => {
      if (!runtime.isE2E) window.show();
    },
    showError: () => {
      dialog.showErrorBox(
        'FlowPilot не запущен',
        'Не удалось загрузить окно FlowPilot. Перезапустите приложение. Если проблема повторится, обратитесь в поддержку.',
      );
    },
    quit: () => {
      app.quit();
    },
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel: clearTimeout,
    timeoutMs: WINDOW_STARTUP_FALLBACK_MS,
  });
  window.webContents.on('did-fail-load', (...args) => {
    if (args[4]) windowStartupGate?.fail();
  });
  if (!runtime.isE2E) windowStartupGate.start();
}

function loadWindow(window: BrowserWindow, address: string): void {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(address);
  }
}

function setFullScreenState(isFullScreen: boolean): void {
  if (mainWindow?.isDestroyed()) return;
  void mainWindow?.webContents.executeJavaScript(
    `document.documentElement.toggleAttribute('data-full-screen', ${String(isFullScreen)})`,
  );
}
