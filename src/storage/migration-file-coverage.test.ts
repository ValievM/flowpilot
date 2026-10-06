import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationFiles } from '../../tests/storage/migration-fixtures/migration-files';

describe('migration test coverage', () => {
  it('has a previous-version test case for every migration file', () => {
    const files: string[] = [];
    const migrationDirectory = join(process.cwd(), 'src/storage/migrations');
    for (const filename of readdirSync(migrationDirectory)) {
      if (filename.endsWith('.sql')) files.push(filename);
    }
    files.sort();
    const coveredFiles: string[] = [];
    for (const migration of migrationFiles)
      coveredFiles.push(migration.filename);

    expect(files).toEqual(coveredFiles);
    expect(migrationFiles.slice(1)).toHaveLength(files.length - 1);
  });
});
