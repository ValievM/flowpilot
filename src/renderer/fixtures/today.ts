import type { RiskKind } from '../../domain/risk/risk';

export type TodayTask = {
  id: string;
  title: string;
  subject: string;
  due: string;
  estimate: string;
  state: 'todo' | 'doing' | 'waiting' | 'done';
  risk?: string;
  riskKind?: Exclude<RiskKind, 'none' | 'ok'>;
  riskTitle?: string;
  step?: string;
};

export const todayTasks: TodayTask[] = [
  {
    id: 'coursework',
    title: 'Курсовая: собрать рабочий прототип',
    subject: 'Проектирование',
    due: 'Пт, 9 октября',
    estimate: 'Около 5 рабочих дней',
    state: 'todo',
    risk: 'До срока 5 рабочих дней, оценка остатка — 5: запас исчерпан, начинать нужно сейчас. По приблизительной оценке.',
    step: 'Собрать поиск и карточку книги',
  },
  {
    id: 'integrals',
    title: 'Разобрать интегралы к практике',
    subject: 'Математика',
    due: 'Ср, 7 октября',
    estimate: 'Примерно 1–2 часа',
    state: 'todo',
  },
  {
    id: 'training',
    title: 'Тренировка',
    subject: 'Здоровье',
    due: 'Без точного времени',
    estimate: 'Примерно 45 минут',
    state: 'todo',
  },
  {
    id: 'lab',
    title: 'Лабораторная: проверить выводы',
    subject: 'Физика',
    due: 'Чт, 8 октября',
    estimate: 'Остался примерно час',
    state: 'doing',
  },
  {
    id: 'presentation',
    title: 'Уточнить тему доклада',
    subject: 'История',
    due: 'Пн, 12 октября',
    estimate: 'Объём неизвестен',
    state: 'waiting',
  },
];
