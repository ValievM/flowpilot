import React from 'react';

interface SettingsScreenProps {
  reduceMotion: boolean;
  onReduceMotionChange: (reduceMotion: boolean) => void;
}

export function SettingsScreen({
  reduceMotion,
  onReduceMotionChange,
}: SettingsScreenProps): React.JSX.Element {
  return (
    <section className="simple-screen settings-screen">
      <p className="eyebrow">ЛИЧНОЕ / НАСТРОЙКИ</p>
      <h1>Настройки</h1>
      <section className="settings-card">
        <h2>Внешний вид</h2>
        <p>Тема переключается в боковой панели.</p>
        <label className="motion-setting">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => {
              onReduceMotionChange(event.target.checked);
            }}
          />
          Уменьшить движение
        </label>
      </section>
    </section>
  );
}
