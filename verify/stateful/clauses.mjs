import { Parser } from "acorn";
import { fail } from "../error.mjs";
import { options, walk } from "./ast.mjs";

// Recognition and admission share this grammar. Unimplemented clauses are
// recognized deliberately, so a typo cannot silently erase an obligation.
const grammar = new Map([
  ...["state", "always", "pending", "resolves"].map((w) => [w, "expression"]),
  ["@environment", "marker"], ["rejects", "marker"], ["settles", "eventually"],
  ...["order", "abort", "leads", "ensures", "requires", "invariant", "safety", "live", "liveness", "fairness", "decreases", "modifies", "environment"].map((w) => [w, "unsupported"]),
]);
function near(a, b) {
  const left = [...a], right = [...b];
  if (Math.abs(left.length - right.length) > 1) return false;
  const d = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= right.length; j++) d[0][j] = j;
  for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + Number(left[i - 1] !== right[j - 1]));
    if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1])
      d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[left.length][right.length] <= 1;
}
export function parseClauses(comments) {
  return comments.map((comment) => {
    const lines = comment.value.split("\n").map((s) => s.replace(/^\s*\*?\s*/, ""));
    const looks = lines.some((line) => {
      const token = line.split(/\s/)[0].normalize("NFKC").toLowerCase().replace(/\p{Default_Ignorable_Code_Point}/gu, "");
      // Inspect the entire token before extracting punctuation. Recognition
      // normalizes lookalikes; admission below still requires the exact keyword.
      const word = /^(@?[\p{L}\p{M}]+)(?=$|[^\p{L}\p{M}_-])/u.exec(token)?.[1] ?? token;
      return [token, word].some((candidate) => candidate && [...grammar.keys()].some((reserved) => near(candidate, reserved)));
    });
    if (!looks) return { comment };
    if (comment.type !== "Line") fail("Contract-looking block comments are unsupported; use one line per clause.", comment);
    const text = comment.value.trim(), [kind] = text.split(/\s/), rule = grammar.get(kind);
    if (!rule || rule === "unsupported") fail(`Unsupported or misspelled contract clause ${kind}.`, comment);
    const tail = text.slice(kind.length).trim();
    if (rule === "marker" && tail || rule === "eventually" && tail !== "eventually") fail(`Invalid ${kind} clause.`, comment);
    let ast;
    if (rule === "expression") {
      const start = comment.start + 2 + comment.value.indexOf(tail, comment.value.indexOf(kind) + kind.length);
      try {
        ast = Parser.parseExpressionAt(tail, 0, options);
        if (tail.slice(ast.end).trim()) throw new Error("trailing text");
      } catch { fail(`Invalid ${kind} expression.`, comment); }
      walk(ast, (n) => {
        n.start += start; n.end += start;
        if (n.type === "Identifier" && n.name === "old" && kind !== "always") fail(`old is unsupported in ${kind}.`, comment);
        if (n.type === "Identifier" && n.name === "real") fail("Exact real contracts are outside C1.", comment);
      });
    }
    return { comment, kind, text: tail, ast, span: { start: comment.start, end: comment.end } };
  });
}
