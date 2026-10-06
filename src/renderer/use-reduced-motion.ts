import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export type MotionChoice = 'system' | 'reduce' | 'full';

const motionStorageKey = 'flowpilot-reduce-motion';

export function isMotionChoice(value: unknown): value is MotionChoice {
  return value === 'system' || value === 'reduce' || value === 'full';
}

function initialChoice(): MotionChoice {
  const stored = window.localStorage.getItem(motionStorageKey);
  return isMotionChoice(stored) ? stored : 'system';
}

export function useReducedMotion(): readonly [
  MotionChoice,
  Dispatch<SetStateAction<MotionChoice>>,
] {
  const [choice, setChoice] = useState<MotionChoice>(initialChoice);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = (): void => {
      const reduce =
        choice === 'reduce' || (choice === 'system' && media.matches);
      document.documentElement.dataset.motionChoice = choice;
      document.documentElement.toggleAttribute('data-reduce-motion', reduce);
    };
    applyPreference();
    media.addEventListener('change', applyPreference);
    if (choice === 'system') {
      window.localStorage.removeItem(motionStorageKey);
    } else {
      window.localStorage.setItem(motionStorageKey, choice);
    }
    return () => {
      media.removeEventListener('change', applyPreference);
    };
  }, [choice]);

  return [choice, setChoice];
}
