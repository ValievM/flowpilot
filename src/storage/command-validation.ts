import { commandSchema } from '../shared/command-schema';
import { scheduleCommandSchema } from './schedule-schema';
import type { StorageCommand } from './types';

/** A command is valid if either the user/AI schema or the schedule schema accepts it. */
export function findInvalidCommand(
  commands: readonly StorageCommand[],
): StorageCommand | undefined {
  return commands.find(
    (command) =>
      !commandSchema.safeParse(command).success &&
      !scheduleCommandSchema.safeParse(command).success,
  );
}
