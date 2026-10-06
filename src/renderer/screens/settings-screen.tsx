import React from 'react';
import { isThemeChoice } from '../theme/use-theme';
import type { ThemeChoice } from '../../shared/contracts';
import { isMotionChoice, type MotionChoice } from '../use-reduced-motion';

const WEEKDAYS = [
  { id: 1, label: 'Понедельник' },
  { id: 2, label: 'Вторник' },
  { id: 3, label: 'Среда' },
  { id: 4, label: 'Четверг' },
  { id: 5, label: 'Пятница' },
  { id: 6, label: 'Суббота' },
  { id: 7, label: 'Воскресенье' },
] as const;

interface SettingsScreenProps {
  readonly theme: ThemeChoice;
  readonly onThemeChange: (theme: ThemeChoice) => void;
  readonly workdays: ReadonlySet<number>;
  readonly onWorkdaysChange: (
    workdays: ReadonlySet<number>,
  ) => Promise<boolean>;
  readonly motionChoice: MotionChoice;
  readonly onMotionChoiceChange: (choice: MotionChoice) => void;
  readonly loading: boolean;
  readonly saveError: string | undefined;
}

export function SettingsScreen({
  theme,
  onThemeChange,
  workdays,
  onWorkdaysChange,
  motionChoice,
  onMotionChoiceChange,
  loading,
  saveError,
}: SettingsScreenProps): React.JSX.Element {
  const [workdaysError, setWorkdaysError] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);
  const describedBy = [
    workdaysError ? 'workdays-error' : undefined,
    saveError ? 'save-error' : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const updateWorkday = async (
    day: number,
    checked: boolean,
  ): Promise<void> => {
    const next = new Set(workdays);
    if (checked) next.add(day);
    else next.delete(day);
    if (next.size === 0) {
      setWorkdaysError('Выберите хотя бы один рабочий день.');
      return;
    }
    setWorkdaysError(undefined);
    setSaving(true);
    await onWorkdaysChange(next);
    setSaving(false);
  };

  return (
    <section className="simple-screen settings-screen">
      <p className="eyebrow">ЛИЧНОЕ / НАСТРОЙКИ</p>
      <h1>Настройки</h1>
      <section className="settings-card" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Внешний вид</h2>
        <label htmlFor="theme-choice">Тема</label>
        <select
          id="theme-choice"
          value={theme}
          onChange={(event) => {
            if (isThemeChoice(event.target.value))
              onThemeChange(event.target.value);
          }}
        >
          <option value="system">Как в системе</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
        </select>
        <label htmlFor="motion-choice">Уменьшить движение</label>
        <select
          id="motion-choice"
          value={motionChoice}
          onChange={(event) => {
            if (isMotionChoice(event.target.value))
              onMotionChoiceChange(event.target.value);
          }}
        >
          <option value="system">Как в системе</option>
          <option value="reduce">Включено</option>
          <option value="full">Выключено</option>
        </select>
      </section>
      <section className="settings-card" aria-labelledby="workdays-heading">
        <h2 id="workdays-heading">Рабочие дни</h2>
        <fieldset
          className="workdays-options"
          aria-describedby={describedBy || undefined}
          disabled={saving || loading}
        >
          <legend>Дни недели, учитываемые при расчёте срока</legend>
          {WEEKDAYS.map(({ id, label }) => (
            <label key={id} className="workday-option">
              <input
                type="checkbox"
                checked={workdays.has(id)}
                onChange={(event) => {
                  void updateWorkday(id, event.target.checked);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {workdaysError && (
          <p id="workdays-error" className="settings-error" role="alert">
            {workdaysError}
          </p>
        )}
        {saveError && (
          <p id="save-error" className="settings-error" role="alert">
            {saveError}
          </p>
        )}
      </section>
    </section>
  );
}
