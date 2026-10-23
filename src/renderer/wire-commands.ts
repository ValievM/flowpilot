import { Temporal } from 'temporal-polyfill';
import type { CommandsApplyRequest } from '../shared/contracts';

type Commands = CommandsApplyRequest['commands'];

/**
 * Temporal values are class instances backed by hidden slots, so Electron's
 * structured clone turns them into empty objects and the main process rejects
 * the command. Everything that crosses IPC must be plain data.
 */
function toWire(value: unknown): unknown {
  if (
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return value.toString();
  }
  if (Array.isArray(value)) return value.map(toWire);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toWire(entry)]),
    );
  }
  return value;
}

export function toWireCommands(commands: Commands): Commands {
  return toWire(commands) as Commands;
}
