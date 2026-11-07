export class SourceError extends Error {
  constructor(message, node, status = "unsupported") {
    super(message);
    this.span = { start: node?.start ?? 0, end: node?.end ?? 0 };
    this.status = status;
  }
}

export function fail(message, node, status) {
  throw new SourceError(message, node, status);
}

// The innermost owner wins: an error keeps the file (and function) whose
// source its span indexes, even when it surfaces through a caller.
export function blame(file, fn, run) {
  try { return run(); }
  catch (e) {
    if (e instanceof SourceError) { e.file ??= file; if (fn) e.fn ??= fn; }
    throw e;
  }
}
