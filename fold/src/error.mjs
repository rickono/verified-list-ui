// A problem in a .fold file, on the span [start, end) of the source.
// Positions are UTF-16 offsets (JavaScript string indices), which is also
// the encoding the content mapper reports.  code: 1 for syntax the reader
// does not accept, 2 for a check that fails (check.mjs, emit-v.mjs).
export class FoldError extends Error {
  constructor(message, start, end, code = 1) {
    super(message);
    this.start = start;
    this.end = Math.max(end, start);
    this.code = code;
  }
}
