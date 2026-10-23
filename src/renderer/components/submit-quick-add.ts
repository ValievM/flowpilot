import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { Series } from '../../domain';

interface QuickAddSubmitState {
  readonly title: string;
  readonly submitting: boolean;
  readonly repeatEnabled: boolean;
  readonly weekdays: readonly number[];
  readonly time: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly onSubmit: (title: string) => Promise<boolean>;
  readonly onCreateSeries: (series: Omit<Series, 'id'>) => Promise<boolean>;
  readonly setTitle: React.Dispatch<React.SetStateAction<string>>;
  readonly setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setError: React.Dispatch<React.SetStateAction<string | undefined>>;
  readonly setRepeatEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setWeekdays: React.Dispatch<React.SetStateAction<number[]>>;
  readonly setTime: React.Dispatch<React.SetStateAction<string>>;
  readonly setEndDate: React.Dispatch<React.SetStateAction<string>>;
  readonly closeDialog: () => void;
  readonly addButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export async function submitQuickAdd(
  event: React.SyntheticEvent<HTMLFormElement>,
  state: QuickAddSubmitState,
): Promise<void> {
  event.preventDefault();
  const title = state.title.trim();
  if (
    !title ||
    state.submitting ||
    (state.repeatEnabled && !state.weekdays.length)
  )
    return;
  state.setSubmitting(true);
  state.setError(undefined);
  const saved = state.repeatEnabled
    ? await state.onCreateSeries({
        title,
        weekdays: [...state.weekdays],
        startsOn: Temporal.PlainDate.from(state.startDate),
        ...(state.time ? { time: Temporal.PlainTime.from(state.time) } : {}),
        ...(state.endDate
          ? { endsOn: Temporal.PlainDate.from(state.endDate) }
          : {}),
      })
    : await state.onSubmit(title);
  state.setSubmitting(false);
  if (!saved) {
    state.setError(
      'Не удалось сохранить задачу. Текст не потерян — попробуйте снова.',
    );
    return;
  }
  state.setTitle((current) => (current === title ? '' : current));
  state.setRepeatEnabled(false);
  state.setWeekdays([]);
  state.setTime('');
  state.setEndDate('');
  state.closeDialog();
  state.addButtonRef.current?.focus();
}
