import type Database from 'better-sqlite3';

export function advanceColumnGeneration(
  database: Database.Database,
  id: string,
): number {
  const current = database
    .prepare('SELECT generation FROM column_generations WHERE id = ?')
    .get(id) as { generation: number } | undefined;
  const generation = current ? current.generation + 1 : 1;
  database
    .prepare(
      'INSERT INTO column_generations(id,generation) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET generation = excluded.generation',
    )
    .run(id, generation);
  return generation;
}
