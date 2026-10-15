export type ErrorCode =
  | 'StaleRevision'
  | 'ValidationFailed'
  | 'UndoConflict'
  | 'NotFound'
  | 'InternalError'
  | 'AlreadyUndone'
  | 'NotUndoable'
  | 'FileNotFound'
  | 'TooLarge'
  | 'NotReadable'
  | 'MissingFile'
  | 'PackageInvalid'
  | 'Cancelled';

export type Result<T, E = ErrorCode> =
  { ok: true; value: T } | { ok: false; error: E };
