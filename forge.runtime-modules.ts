import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Modules the main bundle `require`s at run time (see `external` in
 * vite.main.config.ts plus the ajv standalone-validation helpers). The Forge
 * Vite plugin packs only `.vite`, so these have to be shipped explicitly or
 * the packaged app dies on its first `require`.
 */
const RUNTIME_ROOTS = ['better-sqlite3', '@flowpilot/openat', 'ajv'] as const;

interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

function collect(name: string, from: string, seen: Set<string>): void {
  if (seen.has(name)) return;
  const manifest = createRequire(path.join(from, 'noop.js')).resolve(
    `${name}/package.json`,
  );
  seen.add(name);
  const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson;
  const children = {
    ...parsed.dependencies,
    ...parsed.optionalDependencies,
  };
  for (const child of Object.keys(children)) {
    collect(child, path.dirname(manifest), seen);
  }
}

export function runtimeModuleNames(projectDir: string): readonly string[] {
  const seen = new Set<string>();
  for (const root of RUNTIME_ROOTS) collect(root, projectDir, seen);
  return [...seen].sort();
}

const SQLITE = '/node_modules/better-sqlite3';
const TARGET_PREBUILD = `${SQLITE}/prebuilds/darwin-arm64.node`;

/**
 * Foreign-platform prebuilt binaries the packaged app never loads. The sources
 * (`deps`, `src`) must stay: Forge rebuilds better-sqlite3 for Electron's ABI.
 */
function isUnusedNativeFile(file: string): boolean {
  return (
    file.startsWith(`${SQLITE}/prebuilds/`) &&
    file !== TARGET_PREBUILD &&
    file !== `${SQLITE}/prebuilds/`
  );
}

/** Packager `ignore` callback: true drops the file. `file` starts with `/`. */
export function shouldIgnore(
  file: string,
  modules: readonly string[],
): boolean {
  if (file === '' || file === '/package.json' || file.startsWith('/.vite')) {
    return false;
  }
  if (file === '/node_modules') return false;
  if (isUnusedNativeFile(file)) return true;
  return !modules.some((name) => {
    const prefix = `/node_modules/${name}`;
    const scope = name.startsWith('@')
      ? `/node_modules/${name.slice(0, name.indexOf('/'))}`
      : '';
    return (
      file === prefix ||
      file.startsWith(`${prefix}/`) ||
      (scope !== '' && file === scope)
    );
  });
}
