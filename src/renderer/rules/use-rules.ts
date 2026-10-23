import React from 'react';
import type { IpcRuleIssue, IpcStoredRule } from '../../shared/rule-contracts';
import { RULES_CHANGED } from './use-rule-problems';

type RuleScope = { task_type_ids: string[]; discipline_ids?: string[] };

export type RulesMessage =
  | { readonly kind: 'info'; readonly text: string }
  | {
      readonly kind: 'error';
      readonly text: string;
      readonly issues: readonly IpcRuleIssue[];
    };

export interface RulesModel {
  readonly rules: readonly IpcStoredRule[];
  readonly loaded: boolean;
  readonly message: RulesMessage | undefined;
  readonly importFile: () => Promise<void>;
  readonly exportRule: (id: string) => Promise<void>;
  readonly activate: (id: string) => Promise<void>;
  readonly deactivate: (id: string) => Promise<void>;
  readonly bind: (id: string, scope: RuleScope) => Promise<boolean>;
}

type Failure = {
  readonly kind: string;
  readonly errors?: readonly IpcRuleIssue[];
};

const failureText: Readonly<Record<string, string>> = {
  ValidationFailed: 'Файл не подходит: нужен документ правил в формате .json.',
  NotFound: 'Документ не найден. Обновите список.',
  RuleConflict:
    'Активация отклонена: документ конфликтует с уже активным. Состояние не изменено.',
};

function describeFailure(error: Failure): RulesMessage {
  if (error.kind === 'RuleInvalid')
    return {
      kind: 'error',
      text: 'Документ не прошёл проверку. Прежняя рабочая версия осталась без изменений.',
      issues: error.errors ?? [],
    };
  return {
    kind: 'error',
    text:
      failureText[error.kind] ??
      'Не удалось выполнить действие. Данные не изменены.',
    issues: [],
  };
}

type Outcome = { ok: true } | { ok: false; error: Failure };

function useRulesData(): {
  rules: readonly IpcStoredRule[];
  loaded: boolean;
  refresh: () => Promise<void>;
} {
  const [rules, setRules] = React.useState<readonly IpcStoredRule[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const refresh = React.useCallback(async (): Promise<void> => {
    const result = await window.flowpilot.rules.list();
    if (result.ok) setRules(result.value);
    setLoaded(true);
    window.dispatchEvent(new Event(RULES_CHANGED));
  }, []);
  React.useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  return { rules, loaded, refresh };
}

export function useRules(): RulesModel {
  const { rules, loaded, refresh } = useRulesData();
  const [message, setMessage] = React.useState<RulesMessage>();
  const run = async (
    action: () => Promise<Outcome>,
    done: string,
  ): Promise<boolean> => {
    const result = await action();
    if (!result.ok && result.error.kind === 'Cancelled') return false;
    setMessage(
      result.ok ? { kind: 'info', text: done } : describeFailure(result.error),
    );
    await refresh();
    return result.ok;
  };
  const rulesApi = window.flowpilot.rules;
  return {
    rules,
    loaded,
    message,
    importFile: async () => {
      await run(
        () => rulesApi.importFile(),
        'Документ импортирован как черновик. Проверьте привязку и активируйте его.',
      );
    },
    exportRule: async (id) => {
      await run(
        () => rulesApi.exportFile({ id }),
        'Принятая версия документа сохранена в файл.',
      );
    },
    activate: async (id) => {
      await run(() => rulesApi.activate({ id }), 'Документ активирован.');
    },
    deactivate: async (id) => {
      await run(() => rulesApi.deactivate({ id }), 'Документ отключён.');
    },
    bind: (id, scope) =>
      run(
        () => rulesApi.bind({ id, scope }),
        'Привязка сохранена в черновике. Чтобы она заработала, активируйте документ.',
      ),
  };
}
