import React from 'react';
import type { BackupVerifyResult } from '../../shared/contracts';

type BackupProblem = Extract<
  BackupVerifyResult,
  { readonly ok: false; readonly error: 'PackageInvalid' }
>['problems'][number];

interface BackupRestoreFeedbackProps {
  readonly problems: readonly BackupProblem[];
  readonly error: string | undefined;
  readonly notice: string | undefined;
}

export function BackupRestoreFeedback({
  problems,
  error,
  notice,
}: BackupRestoreFeedbackProps): React.JSX.Element {
  return (
    <>
      {problems.length > 0 && (
        <div role="alert">
          <p>Резервная копия содержит проблемы. Текущие данные не изменены:</p>
          <ul>
            {problems.map((problem) => (
              <li key={`${problem.path}-${problem.message}`}>
                <strong>{problem.path}:</strong> {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
