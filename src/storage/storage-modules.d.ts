declare module 'better-sqlite3' {
  class BetterSqlite3 {
    constructor(path: string);
    readonly open: boolean;
    close(): void;
    exec(source: string): this;
    pragma(source: string): unknown;
    prepare(source: string): BetterSqlite3.Statement;
    transaction<Result>(callback: () => Result): () => Result;
  }

  namespace BetterSqlite3 {
    interface Statement {
      all(...parameters: unknown[]): unknown[];
      get(...parameters: unknown[]): unknown;
      run(...parameters: unknown[]): { changes: number };
    }

    type Database = BetterSqlite3;
  }

  export = BetterSqlite3;
}

declare module '*.sql?raw' {
  const source: string;
  export default source;
}
