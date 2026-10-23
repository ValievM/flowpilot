import React from 'react';

export const RULES_CHANGED = 'flowpilot:rules-changed';

/** One calm number for the sidebar: how many rule problems wait. No dialog, ever. */
export function useRuleProblems(revision: number): number {
  const [count, setCount] = React.useState(0);
  const load = React.useCallback(async (): Promise<void> => {
    try {
      const result = await window.flowpilot.rules.list();
      if (result.ok)
        setCount(
          result.value.reduce((sum, rule) => sum + rule.diagnostics.length, 0),
        );
    } catch {
      // Without rules there is nothing to flag.
    }
  }, []);
  React.useEffect(() => {
    void Promise.resolve().then(load);
  }, [load, revision]);
  React.useEffect(() => {
    const onChange = (): void => {
      void load();
    };
    window.addEventListener(RULES_CHANGED, onChange);
    return () => {
      window.removeEventListener(RULES_CHANGED, onChange);
    };
  }, [load]);
  return count;
}
