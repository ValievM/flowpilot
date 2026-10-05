export type ErrorCode =
  | 'StaleRevision'
  | 'ValidationFailed'
  | 'UndoConflict'
  | 'NotFound'
  | 'InternalError';

export type Result<T> =
  { ok: true; value: T } | { ok: false; error: ErrorCode };
