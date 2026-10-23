import type { CommandsApplyRequest } from '../shared/contracts';
import { toPlain } from '../shared/to-plain';

type Commands = CommandsApplyRequest['commands'];

export function toWireCommands(commands: Commands): Commands {
  return toPlain(commands) as Commands;
}
