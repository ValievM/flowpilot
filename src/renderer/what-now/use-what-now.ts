import React from 'react';
import { errorText } from '../chat/chat-copy';
import { parseWhatNow, type WhatNowView } from './what-now-outcome';

export type WhatNowState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running' }
  | { readonly phase: 'answer'; readonly view: WhatNowView }
  | { readonly phase: 'error'; readonly message: string };

export interface WhatNowModel {
  readonly state: WhatNowState;
  readonly ask: () => void;
  readonly cancel: () => void;
}

export async function requestWhatNow(): Promise<WhatNowState> {
  try {
    const result = await window.flowpilot.ai.scenario({ scenario: 'whatNow' });
    if (!result.ok)
      return { phase: 'error', message: errorText(result.error.kind) };
    const view = parseWhatNow(result.value);
    return view
      ? { phase: 'answer', view }
      : { phase: 'error', message: errorText('InvalidReply') };
  } catch {
    return { phase: 'error', message: errorText('ProviderUnavailable') };
  }
}

/** One explicit request per press; nothing runs when the screen opens. */
export function useWhatNow(): WhatNowModel {
  const [state, setState] = React.useState<WhatNowState>({ phase: 'idle' });
  const running = React.useRef(false);
  return {
    state,
    ask: () => {
      if (running.current) return;
      running.current = true;
      setState({ phase: 'running' });
      void requestWhatNow().then((next) => {
        running.current = false;
        setState(next);
      });
    },
    cancel: () => {
      void window.flowpilot.ai.scenario({ scenario: 'cancel' });
    },
  };
}
