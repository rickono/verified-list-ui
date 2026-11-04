// Span mappings from the printed TypeScript back to the .fold source, in
// the content mapper's format: [virtualStart, virtualLength, originalStart,
// originalLength, kind].  Kind 0 (Verbatim) when both sides hold the same
// text, 1 (Atom) otherwise.
//
// The printed text comes from Rocq (theories/FoldTs.v), so this file only
// recognizes the lines that printer writes.  Anything it does not recognize
// stays unmapped, which TypeScript treats as synthesized code.  Mappings
// help navigation (go to definition from counter.ts lands in the .fold
// file); proof results do not depend on them.

const VERBATIM = 0;
const ATOM = 1;

export function spanMappings(ts, src, ast, ir) {
  const out = [];
  const add = (vStart, vLen, span) => {
    if (!span || vLen <= 0) return;
    const oLen = span.end - span.start;
    const same = oLen === vLen && src.slice(span.start, span.end) === ts.slice(vStart, vStart + vLen);
    out.push([vStart, vLen, span.start, oLen, same ? VERBATIM : ATOM]);
  };

  const model = ast.items.find((i) => i.kind === "model");
  const store = ir.store ? ir.store.store : null;
  const fields = new Map(model ? model.fields.map((f) => [f.name, f.nameSpan]) : []);
  const consts = new Map(ir.consts.map((c) => [c.name, c.span]));
  const rules = new Map(ir.rules.map((r) => [r.tag, r]));
  const tags = new Map(ir.rules.map((r) => [r.tag, r.tagSpan]));
  if (store) {
    tags.set(store.done.name, store.done.span);
    tags.set(store.failed.name, store.failed.span);
  }
  const clausesOf = new Map(ir.update.map(([tag, cs]) => [tag, cs]));

  let section = null; // "model" | "message" | "fire"
  let rule = null;
  let clause = -1;
  let pos = 0;
  for (const line of ts.split("\n")) {
    const at = (re) => {
      const m = re.exec(line);
      return m ? { m, start: pos + m.index + m[0].indexOf(m[1]) } : null;
    };
    let h;
    if (line.startsWith("});") || line.startsWith("};")) section = null;

    if ((h = at(/^export const (\w+) = (?!Schema|define|Command|Effect)/)) && consts.has(h.m[1])) {
      add(h.start, h.m[1].length, consts.get(h.m[1]));
    } else if ((h = at(/^export const (Model) = Schema\.Struct/))) {
      section = "model";
      if (model) add(h.start, 5, model.headSpan);
    } else if ((h = at(/^export const (Message) = defineMessageUnion/))) {
      section = "message";
    } else if ((h = at(/^export const (\w+) = Command\.define/)) && store) {
      add(h.start, h.m[1].length, store.save.span);
    } else if ((h = at(/^export const (initialModel)\b/)) && model) {
      add(h.start, h.m[1].length, model.headSpan);
    } else if ((h = at(/^const (fire) = /))) {
      section = "fire";
    } else if ((h = at(/store\.set\(("\w+")/)) && store) {
      add(h.start, h.m[1].length, store.keySpan);
    } else if (section === "model" && (h = at(/^ {2}(\w+): /))) {
      add(h.start, h.m[1].length, fields.get(h.m[1]));
    } else if (section === "message" && (h = at(/^ {2}(\w+): /))) {
      add(h.start, h.m[1].length, tags.get(h.m[1]));
    } else if (section === "fire" && (h = at(/^ {4}case "(\w+)": \{$/))) {
      rule = rules.get(h.m[1]) ?? null;
      clause = -1;
      if (rule) add(h.start, h.m[1].length, rule.tagSpan);
    } else if (section === "fire" && rule && (h = at(/^ {6}if \(((?!!Schema\.is).*)\) \{$/))) {
      clause++;
      const c = (clausesOf.get(rule.tag) ?? [])[clause];
      if (c) add(h.start, h.m[1].length, c.condSpan ?? c.headSpan);
    } else if (section === "fire" && rule && (h = at(/^ {8}const next: Model = (\{.*\});$/))) {
      const c = (clausesOf.get(rule.tag) ?? [])[clause];
      if (c) add(h.start, h.m[1].length, c.bodySpan);
    } else if (section === "fire" && rule && (h = at(/^ {8}return \{ model: next, commands: \[(\w+\(\{.*\}\))\] \};$/))) {
      const c = (clausesOf.get(rule.tag) ?? [])[clause];
      if (c && c.saveSpan) add(h.start, h.m[1].length, c.saveSpan);
    }
    pos += line.length + 1;
  }
  return out;
}
