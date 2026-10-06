import type { BackupData, BackupManifest } from './schemas';

export type BackupProblem = { readonly path: string; readonly message: string };
export type Verification =
  | {
      readonly ok: true;
      readonly value: { manifest: BackupManifest; data: BackupData };
    }
  | { readonly ok: false; readonly problems: readonly BackupProblem[] };
export type BackupResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string };
