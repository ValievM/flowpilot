export function taskCountPhrase(value: number): string {
  const remainder = value % 100;
  const lastDigit = value % 10;
  const noun =
    remainder >= 11 && remainder <= 14
      ? 'дел'
      : lastDigit === 1
        ? 'дело'
        : lastDigit >= 2 && lastDigit <= 4
          ? 'дела'
          : 'дел';
  return `${String(value)} ${noun}`;
}
