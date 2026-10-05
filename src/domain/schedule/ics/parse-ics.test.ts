import { readFileSync } from 'node:fs';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { parseIcs } from './parse-ics';

const fixture = readFileSync('tests/fixtures/ics/schedule.ics', 'utf8');
const options = {
  defaultTimeZone: 'America/New_York',
  from: Temporal.PlainDate.from('2026-10-05'),
  to: Temporal.PlainDate.from('2026-10-18'),
};

function parsed(text = fixture) {
  return parseIcs(text, options);
}

describe('parseIcs', () => {
  it('parses a UTC fixed event as the correct instant', () => {
    const event = parsed().events.find(({ key }) => key === 'utc-1:2026-10-05');
    expect(event?.start.toInstant().toString()).toBe('2026-10-05T09:00:00Z');
    expect(event?.end.toInstant().toString()).toBe('2026-10-05T10:00:00Z');
  });

  it('converts TZID date-times into the correct UTC instant', () => {
    const event = parsed().events.find(({ key }) =>
      key.startsWith('moscow-1:'),
    );
    expect(event?.start.toInstant().toString()).toBe('2026-10-06T09:00:00Z');
  });

  it('interprets floating time in the explicitly supplied default zone', () => {
    const event = parsed().events.find(({ key }) =>
      key.startsWith('floating-1:'),
    );
    expect(event?.start.timeZoneId).toBe('America/New_York');
    expect(event?.start.hour).toBe(14);
  });

  it('joins folded content lines and unescapes calendar text', () => {
    const event = parsed().events.find(({ key }) =>
      key.startsWith('folded-1:'),
    );
    expect(event?.title).toBe('Длинное описание спродолжением');
  });

  it('expands weekly recurrence within the window and excludes EXDATE', () => {
    const events = parsed().events.filter(({ key }) =>
      key.startsWith('repeat-1:'),
    );
    expect(
      events.map(({ key, start }) => [key, start.toPlainDate().toString()]),
    ).toEqual([
      ['repeat-1:2026-10-05', '2026-10-05'],
      ['repeat-1:2026-10-12', '2026-10-12'],
      ['repeat-1:2026-10-14', '2026-10-14'],
    ]);
  });

  it('replaces the matching recurrence instance with RECURRENCE-ID', () => {
    const event = parsed().events.find(({ key }) => key.includes('2026-10-12'));
    expect(event?.title).toBe('Изменённая пара');
    expect(event?.start.hour).toBe(12);
  });

  it('preserves cancelled status on the fixed event', () => {
    expect(
      parsed().events.find(({ key }) => key.startsWith('cancelled-1:'))
        ?.cancelled,
    ).toBe(true);
  });

  it('reports unknown TZID for its event without losing adjacent events', () => {
    const result = parsed(
      fixture.replace('TZID=Europe/Moscow', 'TZID=Not/AZone'),
    );
    expect(
      result.problems.some(
        ({ reason }) =>
          reason.includes('time zone') || reason.includes('часовой'),
      ),
    ).toBe(true);
    expect(result.events.some(({ key }) => key.startsWith('utc-1:'))).toBe(
      true,
    );
  });

  it('keeps stable keys after event time changes and across parses', () => {
    const baseline = parsed().events.find(({ key }) =>
      key.startsWith('utc-1:'),
    )?.key;
    const changed = parsed(
      fixture
        .replace('20261005T090000Z', '20261005T110000Z')
        .replace('20261005T100000Z', '20261005T120000Z'),
    ).events.find(({ key }) => key.startsWith('utc-1:'))?.key;
    expect(
      parsed().events.find(({ key }) => key.startsWith('utc-1:'))?.key,
    ).toBe(baseline);
    expect(changed).toBe(baseline);
  });

  it('rejects input above the one-megabyte limit', () => {
    const result = parsed('X'.repeat(1_048_577));
    expect(result.events).toEqual([]);
    expect(result.problems[0]?.reason).toContain('1 МБ');
  });

  it('returns a problem rather than throwing for malformed input', () => {
    expect(() => parsed('not an ics file')).not.toThrow();
    expect(parsed('not an ics file').events).toEqual([]);
    expect(parsed('not an ics file').problems.length).toBeGreaterThan(0);
  });

  it('computes an event end from DURATION when DTEND is absent', () => {
    const text =
      'BEGIN:VEVENT\nUID:duration\nDTSTART:20261010T090000Z\nDURATION:PT90M\nEND:VEVENT';
    const event = parsed(text).events[0];
    expect(event?.end.since(event.start).total({ unit: 'minutes' })).toBe(90);
  });
  it('applies weekly COUNT and INTERVAL limits', () => {
    const text = [
      'BEGIN:VEVENT',
      'UID:counted',
      'DTSTART;TZID=Europe/Moscow:20261005T100000',
      'DTEND;TZID=Europe/Moscow:20261005T110000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO;INTERVAL=2;COUNT=2',
      'END:VEVENT',
    ].join('\n');
    const dates = parseIcs(text, {
      ...options,
      to: Temporal.PlainDate.from('2026-11-01'),
    }).events.map(({ start }) => start.toPlainDate().toString());
    expect(dates).toEqual(['2026-10-05', '2026-10-19']);
  });
  it('parses all-day dates as midnight-to-midnight events', () => {
    const event = parsed().events.find(({ key }) =>
      key.startsWith('all-day-1:'),
    );
    expect(event?.start.toPlainDate().toString()).toBe('2026-10-10');
    expect(event?.end.toPlainDate().toString()).toBe('2026-10-11');
  });
});
