import type { BackupData, BackupManifest } from './schemas';

export type BackupProblem = { readonly path: string; readonly message: string };
export type Verification =
  | {
      readonly ok: true;
      readonly value: { manifest: BackupManifest; data: BackupData };
    }
  | { readonly ok: false; readonly problems: readonly BackupProblem[] };
export type RestoredProfileBackup = Readonly<{
  db: string;
  attachments: string | undefined;
}>;
export type BackupResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly backup?: RestoredProfileBackup | undefined;
    }
  | {
      readonly ok: false;
      readonly kind: 'PackageInvalid';
      readonly error: string;
    }
  | {
      readonly ok: false;
      readonly kind: 'OperationalFailure';
      readonly error: string;
    };
