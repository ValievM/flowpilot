import type Database from 'better-sqlite3';

export type StoredReminderLedger = {
  readonly sent: readonly string[];
  readonly risks: Readonly<Record<string, string>>;
};

/**
 * What was already announced. Written directly, outside `apply`: it is app
 * bookkeeping, not the person's data, so it never enters history or undo.
 */
export class ReminderStore {
  constructor(private readonly database: Database.Database) {}

  readLedger(): StoredReminderLedger {
    const row = this.database
      .prepare(
        'SELECT sent_json,risks_json FROM reminder_ledger WHERE singleton = 1',
      )
      .get() as { sent_json: string; risks_json: string } | undefined;
    if (!row) return { sent: [], risks: {} };
    return {
      sent: JSON.parse(row.sent_json) as string[],
      risks: JSON.parse(row.risks_json) as Record<string, string>,
    };
  }

  writeLedger(ledger: StoredReminderLedger): void {
    this.database
      .prepare(
        `INSERT INTO reminder_ledger(singleton,sent_json,risks_json) VALUES(1,?,?)
         ON CONFLICT(singleton) DO UPDATE SET sent_json=excluded.sent_json,risks_json=excluded.risks_json`,
      )
      .run(JSON.stringify(ledger.sent), JSON.stringify(ledger.risks));
  }
}
