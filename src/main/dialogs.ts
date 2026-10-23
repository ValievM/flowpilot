import type { Dialog } from 'electron';

type DialogApi = Pick<Dialog, 'showOpenDialog' | 'showSaveDialog'>;

export function createRuleDialogs(dialog: DialogApi): {
  openRulesFile(): Promise<string | undefined>;
  saveRulesFile(): Promise<string | undefined>;
} {
  return {
    openRulesFile: async () => {
      const choice = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      return choice.canceled ? undefined : choice.filePaths[0];
    },
    saveRulesFile: async () => {
      const choice = await dialog.showSaveDialog({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      return choice.canceled ? undefined : choice.filePath;
    },
  };
}

export function createScheduleDialogs(dialog: DialogApi): {
  openIcsFile(): Promise<string | undefined>;
} {
  return {
    openIcsFile: async () => {
      const choice = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Календарь', extensions: ['ics'] }],
      });
      return choice.canceled ? undefined : choice.filePaths[0];
    },
  };
}

export function createFileDialogs(dialog: DialogApi): {
  pickFile(): Promise<string | undefined>;
  pickFolder(): Promise<string | undefined>;
} {
  return {
    pickFile: async () => {
      const choice = await dialog.showOpenDialog({ properties: ['openFile'] });
      return choice.canceled ? undefined : choice.filePaths[0];
    },
    pickFolder: async () => {
      const choice = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      });
      return choice.canceled ? undefined : choice.filePaths[0];
    },
  };
}
