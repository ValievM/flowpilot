import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import Database from 'better-sqlite3';

function checkStorageAbi() {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-storage-abi-'));
  let database;
  try {
    database = new Database(join(directory, 'storage.sqlite'));
    database.pragma('foreign_keys = ON');
    const migrationPath = join(
      process.cwd(),
      'src/storage/migrations/0001_init.sql',
    );
    database.exec(readFileSync(migrationPath, 'utf8'));
    database.pragma('user_version = 1');
    database
      .prepare(
        `INSERT INTO tasks (
          id, title, column_id, status_kind, position, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('abi-check', 'Electron ABI check', 'todo', 'todo', 0, 'now', 'now');
    const task = database
      .prepare('SELECT id, title FROM tasks WHERE id = ?')
      .get('abi-check');
    assert.deepEqual(task, { id: 'abi-check', title: 'Electron ABI check' });
    console.log('Electron better-sqlite3 ABI and storage round-trip passed.');
  } finally {
    database?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

checkStorageAbi();
