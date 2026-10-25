import React from 'react';
import type { AiProviderStatus } from '../../shared/ai-provider-contracts';
import type { CommandsApplyRequest } from '../../shared/contracts';

type Commands = CommandsApplyRequest['commands'];

function codexNote(codex: AiProviderStatus['codex']): string {
  if (!codex.installed)
    return 'Codex не найден на этом компьютере. Установите Codex CLI, затем вернитесь сюда.';
  if (!codex.loggedIn)
    return 'Codex не авторизован. Откройте Терминал и выполните `codex login`, затем нажмите «Проверить снова».';
  return 'Codex готов: используется ваша подписка ChatGPT, пароль и токены приложению не передаются.';
}

export function AiProviderSettings({
  onApply,
}: {
  readonly onApply: (commands: Commands) => Promise<boolean>;
}): React.JSX.Element {
  const [status, setStatus] = React.useState<AiProviderStatus>();
  const refresh = React.useCallback(async (): Promise<void> => {
    const result = await window.flowpilot.ai.providerStatus();
    if (result.ok) setStatus(result.value);
  }, []);
  React.useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  const choose = async (provider: 'manual' | 'codex'): Promise<void> => {
    const saved = await onApply([
      { kind: 'setting.set', key: 'aiProvider', value: provider },
    ]);
    if (saved) await refresh();
  };
  if (!status) return <section className="settings-card" aria-busy="true" />;
  const codexReady = status.codex.installed && status.codex.loggedIn;
  return (
    <section className="settings-card" aria-labelledby="ai-provider-heading">
      <h2 id="ai-provider-heading">AI</h2>
      <label className="workday-option">
        <input
          type="radio"
          name="ai-provider"
          checked={status.provider === 'manual'}
          onChange={() => void choose('manual')}
        />
        Ручной обмен: приложение показывает запрос, вы вставляете ответ
      </label>
      <label className="workday-option">
        <input
          type="radio"
          name="ai-provider"
          checked={status.provider === 'codex'}
          disabled={!codexReady && status.provider !== 'codex'}
          onChange={() => void choose('codex')}
        />
        Codex (подписка ChatGPT): ответ приходит сам
      </label>
      <p role="note">{codexNote(status.codex)}</p>
      <p>
        Запрос уходит в Codex только по вашему нажатию («Отправить»,
        «Перестроить», «Что делать сейчас?»). В запрос входят названия,
        описания, подзадачи и комментарии задач, сроки и ближайшие занятия;
        файлы-вложения не читаются.
      </p>
      {!codexReady && (
        <button className="button" type="button" onClick={() => void refresh()}>
          Проверить снова
        </button>
      )}
    </section>
  );
}
