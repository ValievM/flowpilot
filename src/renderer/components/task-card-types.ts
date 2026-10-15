import type { CommandsApplyRequest } from '../../shared/contracts';

export type TaskUpdateChanges = Extract<
  CommandsApplyRequest['commands'][number],
  { kind: 'task.update' }
>['changes'];
