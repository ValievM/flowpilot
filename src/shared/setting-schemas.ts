import { z } from 'zod';

const nonEmptyWorkdays = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .refine((days) => new Set(days).size === days.length);
const themeChoice = z.enum(['system', 'light', 'dark']);
const aiModeChoice = z.enum(['auto', 'confirm']);
const aiProviderChoice = z.enum(['manual', 'codex']);
const reminderSettings = {
  remindersEnabled: z.boolean(),
  reminderLeadMinutes: z.number().int().min(1).max(120),
};
export const settingValueSchemas: Readonly<Record<string, z.ZodType>> = {
  workdays: nonEmptyWorkdays,
  theme: themeChoice,
  aiMode: aiModeChoice,
  aiProvider: aiProviderChoice,
  ...reminderSettings,
  // Only the main process records what macOS answered.
  notificationPermission: z.enum(['unknown', 'granted', 'denied']),
};
export const genericSettingValueSchemas: Readonly<Record<string, z.ZodType>> = {
  workdays: nonEmptyWorkdays,
  aiMode: aiModeChoice,
  aiProvider: aiProviderChoice,
  ...reminderSettings,
};
