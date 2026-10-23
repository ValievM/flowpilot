import React from 'react';
import { errorText } from '../chat/chat-copy';
import {
  parseChatOutcome,
  type ChatChange,
  type ChatRejectedCommand,
} from '../chat/chat-outcome';
import { callScenario } from '../chat/scenario-call';
import type { UndoOutcome } from '../use-history';

export type ReplanState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running' }
  | {
      readonly phase: 'proposal';
      readonly proposalId: string;
      readonly changes: readonly ChatChange[];
      readonly rationale: string;
      readonly rejected: readonly ChatRejectedCommand[];
      readonly builtAt: number;
      readonly busy: boolean;
    }
  | {
      readonly phase: 'applied';
      readonly rejected: readonly ChatRejectedCommand[];
      readonly undone: boolean;
    }
  | { readonly phase: 'kept' }
  | { readonly phase: 'cancelled' }
  | { readonly phase: 'error'; readonly message: string };

export interface ReplanDeps {
  readonly revision: number;
  readonly onApplied: () => Promise<void>;
  readonly undo: () => Promise<UndoOutcome>;
}

export interface ReplanModel {
  readonly state: ReplanState;
  readonly stale: boolean;
  readonly run: () => void;
  readonly apply: () => void;
  readonly keep: () => void;
  readonly undo: () => void;
  readonly cancel: () => void;
}

type Result = Awaited<ReturnType<typeof callScenario>>;

function toState(result: Result, builtAt: number): ReplanState {
  if (!result.ok)
    return result.error.kind === 'Aborted'
      ? { phase: 'cancelled' }
      : { phase: 'error', message: errorText(result.error.kind) };
  const outcome = parseChatOutcome(result.value);
  if (!outcome) return { phase: 'error', message: errorText('InvalidReply') };
  if (outcome.kind === 'applied')
    return {
      phase: 'applied',
      rejected: outcome.rejectedCommands,
      undone: false,
    };
  if (outcome.kind === 'rejected')
    return outcome.error.kind === 'Declined'
      ? { phase: 'kept' }
      : { phase: 'error', message: errorText(outcome.error.kind) };
  return {
    phase: 'proposal',
    proposalId: outcome.proposalId,
    changes: outcome.diff.changes,
    rationale: outcome.rationale ?? '',
    rejected: outcome.rejectedCommands,
    builtAt,
    busy: false,
  };
}

function markUndone(state: ReplanState): ReplanState {
  return state.phase === 'applied' ? { ...state, undone: true } : state;
}

async function runOnce(
  builtAt: number,
  finish: (result: Result, builtAt: number) => Promise<void>,
): Promise<void> {
  await finish(await callScenario({ scenario: 'replan' }), builtAt);
}

/** Replanning runs only when asked: opening any screen never calls it. */
export function useReplan(deps: ReplanDeps): ReplanModel {
  const [state, setState] = React.useState<ReplanState>({ phase: 'idle' });
  const latest = React.useRef(deps);
  // A ref, not state: two presses can land before the screen has re-drawn.
  const inflight = React.useRef(false);
  React.useEffect(() => {
    latest.current = deps;
  });
  const finish = async (result: Result, builtAt: number): Promise<void> => {
    const next = toState(result, builtAt);
    setState(next);
    if (next.phase === 'applied') await latest.current.onApplied();
  };
  const settle = (scenario: 'confirm' | 'reject'): void => {
    if (state.phase !== 'proposal' || state.busy) return;
    const { proposalId, builtAt } = state;
    setState({ ...state, busy: true });
    void callScenario({ scenario, proposalId }).then((result) =>
      finish(result, builtAt),
    );
  };
  return {
    state,
    stale: state.phase === 'proposal' && state.builtAt !== deps.revision,
    run: () => {
      if (inflight.current) return;
      inflight.current = true;
      setState({ phase: 'running' });
      void runOnce(latest.current.revision, finish).finally(() => {
        inflight.current = false;
      });
    },
    apply: () => {
      settle('confirm');
    },
    keep: () => {
      settle('reject');
    },
    undo: () => {
      void deps.undo().then((outcome) => {
        if (outcome === 'ok') setState(markUndone);
      });
    },
    cancel: () => void callScenario({ scenario: 'cancel' }),
  };
}
