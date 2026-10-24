import React from 'react';
import type { CommandsApplyRequest } from '../../shared/contracts';
import type { NotificationsStatus } from '../../shared/notification-contracts';

type Commands = CommandsApplyRequest['commands'];
const LEADS = [5, 10, 15, 30, 60] as const;

const permissionText = {
  unknown: 'Разрешение macOS ещё не запрашивалось.',
  granted: 'Уведомления разрешены.',
  denied:
    'macOS не разрешила уведомления. Включите их в «Системных настройках» → «Уведомления»; пока дела остаются на доске, ничего не теряется.',
} as const;

export function RemindersSettings({
  onApply,
}: {
  readonly onApply: (commands: Commands) => Promise<boolean>;
}): React.JSX.Element {
  const [status, setStatus] = React.useState<NotificationsStatus>();
  const refresh = React.useCallback(async (): Promise<void> => {
    const result = await window.flowpilot.notifications.status();
    if (result.ok) setStatus(result.value);
  }, []);
  React.useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  const change = async (
    key: 'remindersEnabled' | 'reminderLeadMinutes',
    value: boolean | number,
  ): Promise<void> => {
    if (await onApply([{ kind: 'setting.set', key, value }])) await refresh();
  };
  const configure = async (): Promise<void> => {
    const result = await window.flowpilot.notifications.configure();
    if (result.ok) setStatus(result.value);
  };
  if (!status) return <section className="settings-card" aria-busy="true" />;
  return (
    <section className="settings-card" aria-labelledby="reminders-heading">
      <h2 id="reminders-heading">Напоминания</h2>
      <label className="workday-option">
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(event) => {
            void change('remindersEnabled', event.target.checked);
          }}
        />
        Напоминать о занятиях и делах со временем
      </label>
      <label>
        За сколько минут напомнить
        <select
          value={status.leadMinutes}
          onChange={(event) => {
            void change('reminderLeadMinutes', Number(event.target.value));
          }}
        >
          {LEADS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes}
            </option>
          ))}
        </select>
      </label>
      <p role="note">{permissionText[status.permission]}</p>
      {status.permission !== 'granted' && (
        <button
          className="button"
          type="button"
          onClick={() => void configure()}
        >
          {status.permission === 'denied' ? 'Проверить снова' : 'Настроить'}
        </button>
      )}
    </section>
  );
}
