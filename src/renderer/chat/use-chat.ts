import React from 'react';
import type { AiScenarioResult } from '../../shared/contracts';
import type { UndoOutcome } from '../use-history';
import type { WhatNowView } from '../what-now/what-now-outcome';
import { requestWhatNow } from '../what-now/use-what-now';
import { callScenario as call } from './scenario-call';
import { usePendingExchange } from './use-pending-exchange';
import { errorText } from './chat-copy';
import {
  parseChatOutcome,
  type ChatChange,
  type ChatOutcome,
  type ChatRejectedCommand,
} from './chat-outcome';

export type AiMode = 'auto' | 'confirm';

export type ChatTurn = {
  readonly id: number;
  readonly text: string;
  readonly manual?:
    { readonly operationId: string; readonly prompt: string } | undefined;
  readonly state:
    | { readonly phase: 'running' }
    | {
        readonly phase: 'proposal';
        readonly proposalId: string;
        readonly changes: readonly ChatChange[];
        readonly rejected: readonly ChatRejectedCommand[];
        readonly busy: boolean;
      }
    | {
        readonly phase: 'applied';
        readonly rejected: readonly ChatRejectedCommand[];
        readonly undone: boolean;
      }
    | { readonly phase: 'whatNow'; readonly view: WhatNowView }
    | { readonly phase: 'declined' }
    | { readonly phase: 'cancelled' }
    | { readonly phase: 'error'; readonly message: string };
};

export interface ChatDeps {
  readonly onApplied: () => Promise<void>;
  readonly undo: () => Promise<UndoOutcome>;
}

export interface ChatModel {
  readonly turns: readonly ChatTurn[];
  readonly mode: AiMode;
  readonly modeError: string | undefined;
  readonly running: boolean;
  readonly send: (text: string) => void;
  readonly askWhatNow: () => void;
  readonly cancel: () => void;
  readonly confirm: (turnId: number) => void;
  readonly decline: (turnId: number) => void;
  readonly undo: (turnId: number) => void;
  readonly setMode: (mode: AiMode) => void;
  readonly loadMode: () => void;
  readonly replyManually: (turnId: number, text: string) => Promise<boolean>;
}

function outcomeState(value: ChatOutcome | undefined): ChatTurn['state'] {
  if (!value) return { phase: 'error', message: errorText('InvalidReply') };
  if (value.kind === 'rejected')
    return value.error.kind === 'Declined'
      ? { phase: 'declined' }
      : { phase: 'error', message: errorText(value.error.kind) };
  if (value.kind === 'applied')
    return {
      phase: 'applied',
      rejected: value.rejectedCommands,
      undone: false,
    };
  return {
    phase: 'proposal',
    proposalId: value.proposalId,
    changes: value.diff.changes,
    rejected: value.rejectedCommands,
    busy: false,
  };
}

function resultState(result: AiScenarioResult): ChatTurn['state'] {
  if (!result.ok)
    return result.error.kind === 'Aborted'
      ? { phase: 'cancelled' }
      : { phase: 'error', message: errorText(result.error.kind) };
  return outcomeState(parseChatOutcome(result.value));
}

async function saveMode(mode: AiMode): Promise<boolean> {
  try {
    const snapshot = await window.flowpilot.snapshot.load();
    if (!snapshot.ok) return false;
    const result = await window.flowpilot.commands.apply({
      expectedRevision: snapshot.value.revision,
      commands: [{ kind: 'setting.set', key: 'aiMode', value: mode }],
    });
    return result.ok;
  } catch {
    return false;
  }
}

function useAiMode(): Pick<
  ChatModel,
  'mode' | 'modeError' | 'setMode' | 'loadMode'
> {
  const [mode, setModeState] = React.useState<AiMode>('auto');
  const [modeError, setModeError] = React.useState<string>();
  const loadMode = React.useCallback((): void => {
    void window.flowpilot.snapshot.load().then((result) => {
      if (!result.ok) return;
      const stored = (result.value.settings as { aiMode?: string }).aiMode;
      if (stored === 'auto' || stored === 'confirm') setModeState(stored);
    });
  }, []);
  const setMode = (next: AiMode): void => {
    void saveMode(next).then((saved) => {
      if (saved) setModeState(next);
      setModeError(
        saved ? undefined : 'Не удалось сохранить режим. Он не изменён.',
      );
    });
  };
  return { mode, modeError, setMode, loadMode };
}

type PatchTurn = (id: number, change: Partial<ChatTurn>) => void;

function useTurns(): {
  turns: readonly ChatTurn[];
  setTurns: React.Dispatch<React.SetStateAction<readonly ChatTurn[]>>;
  patch: PatchTurn;
} {
  const [turns, setTurns] = React.useState<readonly ChatTurn[]>([]);
  const patch = React.useCallback<PatchTurn>((id, change) => {
    setTurns((current) =>
      current.map((turn) => (turn.id === id ? { ...turn, ...change } : turn)),
    );
  }, []);
  const runningId = turns.find((turn) => turn.state.phase === 'running')?.id;
  const found = React.useCallback(
    (exchange: { operationId: string; prompt: string }) => {
      if (runningId !== undefined) patch(runningId, { manual: exchange });
    },
    [runningId, patch],
  );
  usePendingExchange(runningId !== undefined, found);
  return { turns, setTurns, patch };
}

function mapPhase(
  turns: readonly ChatTurn[],
  id: number,
  from: ChatTurn['state']['phase'],
  change: (turn: ChatTurn) => ChatTurn,
): ChatTurn[] {
  return turns.map((turn) =>
    turn.id === id && turn.state.phase === from ? change(turn) : turn,
  );
}

function markUndone(turns: readonly ChatTurn[], id: number): ChatTurn[] {
  return mapPhase(turns, id, 'applied', (item) =>
    item.state.phase === 'applied'
      ? { ...item, state: { ...item.state, undone: true } }
      : item,
  );
}

type Setter = React.Dispatch<React.SetStateAction<readonly ChatTurn[]>>;

function useProposalActions(
  deps: ChatDeps,
  turns: readonly ChatTurn[],
  setTurns: Setter,
  patch: PatchTurn,
): Pick<ChatModel, 'confirm' | 'decline'> & {
  finish: (id: number, result: AiScenarioResult) => Promise<void>;
} {
  const finish = async (
    id: number,
    result: AiScenarioResult,
  ): Promise<void> => {
    const state = resultState(result);
    patch(id, { state, manual: undefined });
    if (state.phase === 'applied') await deps.onApplied();
  };
  const settle = (id: number, scenario: 'confirm' | 'reject'): void => {
    const turn = turns.find((item) => item.id === id);
    if (turn?.state.phase !== 'proposal') return;
    const proposalId = turn.state.proposalId;
    setTurns((current) =>
      mapPhase(current, id, 'proposal', (item) =>
        item.state.phase === 'proposal'
          ? { ...item, state: { ...item.state, busy: true } }
          : item,
      ),
    );
    void call({ scenario, proposalId }).then((result) => finish(id, result));
  };
  return {
    finish,
    confirm: (id) => {
      settle(id, 'confirm');
    },
    decline: (id) => {
      settle(id, 'reject');
    },
  };
}

function useRequests(
  running: boolean,
  setTurns: Setter,
  patch: PatchTurn,
  finish: (id: number, result: AiScenarioResult) => Promise<void>,
): Pick<ChatModel, 'send' | 'askWhatNow'> {
  const nextId = React.useRef(1);
  // A ref, not state: two presses can land before the screen has re-drawn.
  const inflight = React.useRef(false);
  const start = (text: string): number | undefined => {
    if (running || inflight.current) return undefined;
    inflight.current = true;
    const id = nextId.current++;
    setTurns((current) => [
      ...current,
      { id, text, state: { phase: 'running' } },
    ]);
    return id;
  };
  const release = (): void => {
    inflight.current = false;
  };
  return {
    send: (text) => {
      const trimmed = text.trim();
      const id = trimmed ? start(trimmed) : undefined;
      if (id === undefined) return;
      void call({ scenario: 'createFromText', text: trimmed })
        .then((result) => finish(id, result))
        .finally(release);
    },
    askWhatNow: () => {
      const id = start('Что делать сейчас?');
      if (id === undefined) return;
      void requestWhatNow()
        .then((next) => {
          patch(id, {
            state:
              next.phase === 'answer'
                ? { phase: 'whatNow', view: next.view }
                : {
                    phase: 'error',
                    message: next.phase === 'error' ? next.message : '',
                  },
          });
        })
        .finally(release);
    },
  };
}

export function useChat(deps: ChatDeps): ChatModel {
  const { turns, setTurns, patch } = useTurns();
  const modeModel = useAiMode();
  const { finish, confirm, decline } = useProposalActions(
    deps,
    turns,
    setTurns,
    patch,
  );
  const running = turns.some((turn) => turn.state.phase === 'running');
  return {
    ...modeModel,
    ...useRequests(running, setTurns, patch, finish),
    turns,
    running,
    confirm,
    decline,
    cancel: () => void call({ scenario: 'cancel' }),
    undo: (id) => {
      void deps.undo().then((outcome) => {
        if (outcome === 'ok') setTurns((current) => markUndone(current, id));
      });
    },
    replyManually: async (id, text) => {
      const operationId = turns.find((turn) => turn.id === id)?.manual
        ?.operationId;
      if (!operationId) return false;
      const result = await window.flowpilot.ai.reply({ operationId, text });
      return result.ok;
    },
  };
}
