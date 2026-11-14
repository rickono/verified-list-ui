import { Parser } from "acorn";
import { fail } from "../error.mjs";
import { options, walk } from "./ast.mjs";

// Recognition and admission share this grammar. Unimplemented clauses are
// recognized deliberately, so a typo cannot silently erase an obligation.
const grammar = new Map([
  ...["state", "always", "pending", "resolves"].map((w) => [w, "expression"]),
  ["protocol", "protocol"], ["abort", "abort"],
  ["@environment", "marker"], ["rejects", "marker"], ["settles", "eventually"],
  ["leads", "completion"], ["fairness", "resumptions"],
  ...["order", "ensures", "requires", "invariant", "safety", "live", "liveness", "decreases", "modifies", "environment", "event", "delivers", "counts", "unique", "uniqueness", "enabled", "enabledness", "eventually", "until", "next", "temporal"].map((w) => [w, "unsupported"]),
  ...["completes", "completion", "succeeds", "success", "commits", "commit", "count", "rank", "ranks", "fair", "scheduler"].map((w) => [w, "temporal-unsupported"]),
]);
const confusables = new Map(Object.entries({ а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s",
  ԁ: "d", ӏ: "l", ԛ: "q", ɡ: "g", α: "a", ε: "e", ο: "o", ρ: "p", ι: "i", κ: "k", τ: "t", ν: "v" }));
const skeleton = (token) => [...token.normalize("NFKC").toLowerCase().replace(/\p{Default_Ignorable_Code_Point}/gu, "")]
  .map((c) => confusables.get(c) ?? c).join("");
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
      const token = skeleton(line.split(/\s/)[0]);
      // Inspect the entire token before extracting punctuation. Recognition
      // normalizes lookalikes; admission below still requires the exact keyword.
      const word = /^(@?[\p{L}\p{M}]+)(?=$|[^\p{L}\p{M}_-])/u.exec(token)?.[1] ?? token;
      const prefix = /^(@?[\p{L}\p{M}]+)/u.exec(token)?.[1];
      const temporal = [...grammar].filter(([, rule]) => ["completion", "resumptions", "temporal-unsupported"].includes(rule)).map(([w]) => w);
      const suffix = skeleton(line.trim().split(/\s+/).at(-1)).replace(/[.!,:;]$/, "");
      return [token, word].some((candidate) => candidate && [...grammar.keys()].some((reserved) => near(candidate, reserved)))
        || prefix && temporal.some((reserved) => near(prefix, reserved))
        || line.includes(" ") && temporal.some((reserved) => near(suffix, reserved));
    });
    if (!looks) return { comment };
    if (comment.type !== "Line") fail("Contract-looking block comments are unsupported; use one line per clause.", comment);
    const text = comment.value.trim(), [kind] = text.split(/\s/), rule = grammar.get(kind);
    if (!rule || rule === "unsupported" || rule === "temporal-unsupported") fail(`Unsupported or misspelled contract clause ${kind}.`, comment);
    const tail = text.slice(kind.length).trim();
    if (rule === "marker" && tail || rule === "eventually" && tail !== "eventually") fail(`Invalid ${kind} clause.`, comment);
    if (rule === "protocol" && tail !== "node22-event-target-v1") fail("Unsupported protocol clause.", comment);
    if (rule === "abort" && !/^advisory [A-Za-z_][\w]*$/.test(tail)) fail("Unsupported abort clause; use abort advisory <signal parameter>.", comment);
    if (rule === "completion" && !/^[A-Za-z_][\w]* completes$/.test(tail)) fail("Invalid leads clause; only leads <entry> completes is supported.", comment);
    if (rule === "resumptions" && tail !== "resumptions weak") fail("Invalid fairness clause; only fairness resumptions weak is supported.", comment);
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
