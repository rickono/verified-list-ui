// Tokens of a .fold file.  Positions are UTF-16 offsets (JavaScript string
// indices), which is also the encoding the content mapper reports.

export class FoldError extends Error {
  constructor(message, start, end, code = 1) {
    super(message);
    this.start = start;
    this.end = Math.max(end, start);
    this.code = code;
  }
}

const PUNCT = [
  "===", "!==", "=>", "<=", ">=", "&&", "||",
  "{", "}", "(", ")", "[", "]", "<", ">", "=", ";", ":", ",", ".", "+", "-", "*", "!", "|",
];

const isIdStart = (c) => /[A-Za-z_]/.test(c);
const isIdPart = (c) => /[A-Za-z0-9_]/.test(c);

export function lex(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (src.startsWith("//", i)) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (src.startsWith("/*", i)) {
      const j = src.indexOf("*/", i + 2);
      if (j < 0) throw new FoldError("This comment is never closed.", i, i + 2);
      i = j + 2;
      continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdPart(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9_]/.test(src[j])) j++;
      if (j < src.length && (isIdPart(src[j]) || src[j] === ".")) {
        throw new FoldError("Numbers are whole decimal numbers, like 42 or 1_000.", i, j + 1);
      }
      const text = src.slice(i, j);
      if (text.endsWith("_") || text.includes("__")) {
        throw new FoldError("Put underscores only between digits, like 1_000.", i, j);
      }
      if (text.length > 1 && text[0] === "0") {
        throw new FoldError("Numbers do not start with 0.", i, j);
      }
      toks.push({ t: "num", v: BigInt(text.replaceAll("_", "")), start: i, end: j });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\") throw new FoldError("Strings cannot contain backslashes or escapes.", j, j + 1);
        if (src[j] === "\n") throw new FoldError("This string is never closed.", i, j);
        const code = src.charCodeAt(j);
        if (code < 0x20 || code > 0x7e) {
          throw new FoldError("Strings hold printable ASCII only (no \" or \\).", j, j + 1);
        }
        j++;
      }
      if (j >= src.length) throw new FoldError("This string is never closed.", i, j);
      toks.push({ t: "str", v: src.slice(i + 1, j), start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    if (src.startsWith("==", i) && !src.startsWith("===", i)) {
      throw new FoldError("Use === to compare.", i, i + 2);
    }
    if (src.startsWith("!=", i) && !src.startsWith("!==", i)) {
      throw new FoldError("Use !== to compare.", i, i + 2);
    }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (!p) throw new FoldError(`Unexpected character ${JSON.stringify(c)}.`, i, i + 1);
    toks.push({ t: "p", v: p, start: i, end: i + p.length });
    i += p.length;
  }
  toks.push({ t: "eof", v: "end of file", start: src.length, end: src.length });
  return toks;
}
