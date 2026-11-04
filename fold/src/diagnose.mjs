// Soft-mode results as diagnostics on the .fold source.
//
// Codes: 1 parse, 2 check, 3 a rule may break an invariant, 4 an
// invariant fails initially or for a stored value, 5 fwfb is false,
// 6 Rocq itself failed.

import { obligations } from "./emit-v.mjs";

// A Rocq term from fold_report, in .fold terms.
export function cleanTerm(t) {
  let s = t
    .replace(/%[ZN]/g, "")
    .replace(/\b[ZN]\.of_nat /g, "")
    .replace(/\bmodel_([A-Za-z0-9_]+)/g, "model.$1")
    .replace(/\bstored_([A-Za-z0-9_]+)/g, "stored.$1")
    .replace(/\/\\/g, "&&")
    .replace(/\\\//g, "||")
    .replace(/<->/g, "===")
    .replace(/<>/g, "!==")
    .replace(/~ ?/g, "!")
    .replace(/(^|[^=<>!])=([^=>]|$)/g, "$1===$2")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\s*&&\s*true === true/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // A boolean field the proof already split on leaves false || p or true || p.
  s = stripOuter(s).replace(/(^|\()false \|\| /g, "$1");
  if (/^true \|\| /.test(s)) return "true";
  return stripOuter(s);
}

function stripOuter(s) {
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      if (depth === 0) return s;
    }
    s = s.slice(1, -1);
  }
  return s;
}

const HYP_ROLE = {
  Ha: "the parameter's Schema",
  G: "the condition",
  H: "before",
  M: "the Schema bounds on the stored fields",
};
const HYP_ORDER = ["G", "H", "Ha", "M"];

function explain(f, invName) {
  const hyps = f.hyps
    .filter((h) => h.name in HYP_ROLE)
    .map((h) => ({ ...h, text: cleanTerm(h.type) }))
    .filter((h) => h.text !== "true" && h.text !== "true === true" && h.text !== "")
    .sort((a, b) => HYP_ORDER.indexOf(a.name) - HYP_ORDER.indexOf(b.name));
  const lines = [`  needs:  ${cleanTerm(f.goal ?? "?")}`];
  if (hyps.length) {
    lines.push("  knows:");
    for (const h of hyps) lines.push(`    ${h.text}   (${h.name === "H" ? `${invName} ${HYP_ROLE.H}` : HYP_ROLE[h.name]})`);
  }
  return lines.join("\n");
}

const at = (span, code, messageText) => ({
  start: span.start,
  length: Math.max(0, span.end - span.start),
  code,
  messageText,
});

export function diagnoseSoft(ir, soft, rocq) {
  const diags = [];
  if (rocq.code !== 0 || soft.wf === null) {
    const msg = (rocq.err || rocq.out).trim().split("\n").slice(0, 12).join("\n");
    diags.push(at({ start: 0, end: 0 }, 6, `Rocq could not check the generated file.\n${msg}`));
    return diags;
  }
  if (soft.wf === false) {
    diags.push(at({ start: 0, end: 0 }, 5, "Rocq's well-formedness check (fwfb in theories/Fold.v) rejects this program. This is a bug in fold/: its own checks should have caught it."));
  }
  const failed = (o) => {
    const r = soft.obligations.get(o.lemma);
    return !r || r.failures.length > 0 || !!r.error;
  };
  const all = obligations(ir);
  for (const o of all) {
    // restore with nothing saved is the initial model, so a failed init
    // proof fails the stored one too; report it once.
    if (o.kind === "stored" && all.some((i) => i.kind === "init" && i.inv === o.inv && failed(i))) continue;
    const r = soft.obligations.get(o.lemma);
    if (!r) {
      diags.push(at(o.inv.node.nameSpan, 6, `Rocq never reached the proof of ${o.lemma}.`));
      continue;
    }
    if (!r.failures.length && !r.error) continue;
    const inv = o.inv.name;
    const more = r.failures.length > 1 ? `\n(and ${r.failures.length - 1} more case${r.failures.length > 2 ? "s" : ""})` : "";
    const detail = r.failures.length ? `\n${explain(r.failures[0], inv)}${more}` : "\nThe proof script failed before lia ran.";
    if (o.kind === "clause") {
      const c = o.clause;
      const which = c.isElse ? `the else branch of ${c.tag}` : c.condSpan ? `this branch of ${c.tag}` : c.tag;
      const note = c.isElse || c.index > 0 ? "\nEach branch is proved on its own: the proof does not assume the earlier conditions failed." : "";
      diags.push(at(c.headSpan, 3, `${inv} might not hold after ${which}. Rocq's lia could not prove it, with model as it was before the message:${detail}${note}`));
    } else if (o.kind === "init") {
      diags.push(at(o.inv.node.nameSpan, 4, `${inv} does not hold for the initial model.${detail}`));
    } else {
      diags.push(at(o.inv.node.nameSpan, 4, `${inv} might not hold for a stored value. restore accepts any saved fields that fit their Schemas, and keeps the initial value of the others:${detail}`));
    }
  }
  return diags;
}
