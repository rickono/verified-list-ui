// Read only the erased declaration grammar and module bindings. Runtime
// parsing and executable slices still belong to Acorn and Node stripping.
import { tokenizer } from "acorn";
import { fail } from "./error.mjs";

const OPTIONS = { ecmaVersion: 2022, sourceType: "module" };
export const TYPE_BUILTINS = new Set(["number", "boolean", "undefined", "Array", "ReadonlyArray", "Readonly"]);

export function frontend(file, source, program) {
  const tokens = [];
  try {
    for (const t of tokenizer(source, OPTIONS)) {
      const text = source.slice(t.start, t.end);
      // Acorn lexes nested generic closers as a shift operator.
      if (/^>{1,3}=?$/.test(text)) {
        for (let n = 0; n < text.length; n++) tokens.push({ text: text[n], start: t.start + n, end: t.start + n + 1 });
      } else tokens.push({ text, value: t.value, start: t.start, end: t.end });
    }
  } catch (e) { fail(`Unsupported TypeScript token: ${e.message}`, { start: e.pos, end: e.pos + 1 }); }
  const aliases = new Map(), imports = [], exports = [], handled = new Set();
  const within = (start, end) => tokens.filter((t) => t.start >= start && t.end <= end);
  function moduleBinding(ts, top) {
    let i = 0;
    const take = (s) => ts[i]?.text === s ? (++i, true) : false;
    const expect = (s) => { if (!take(s)) fail(`Expected ${s} in a module binding.`, top); };
    const name = () => {
      const t = ts[i++];
      if (!t || !/^[A-Za-z_$][\w$]*$/.test(t.text)) fail("Module bindings need ordinary identifier names.", top);
      return t.text;
    };
    const importing = take("import");
    if (!importing) expect("export");
    const typeOnly = take("type");
    const bindings = [];
    if (take("*")) {
      if (importing || ts[i]?.text === "as") fail("Namespace imports and namespace exports are unsupported.", top);
      bindings.push({ star: true, kind: typeOnly ? "type" : "value" });
    } else {
      if (importing && ts[i]?.text !== "{") {
        if (typeof ts[i]?.value === "string" && /^["']/.test(ts[i].text)) fail("Side-effect and empty imports are unsupported.", top);
        bindings.push({ imported: "default", local: name(), kind: typeOnly ? "type" : "value" });
        if (ts[i]?.text !== "from") expect(",");
      }
      if (take("{")) {
        while (!take("}")) {
          let kind = typeOnly ? "type" : "value";
          if (ts[i]?.text === "type" && !["as", ",", "}"].includes(ts[i + 1]?.text)) { i++; kind = "type"; }
          const local = name(), other = take("as") ? name() : local;
          bindings.push(importing ? { imported: local, local: other, kind } : { local, exported: other, kind });
          if (ts[i]?.text !== "}") expect(",");
        }
      }
    }
    let specifier;
    if (importing || ts[i]?.text === "from") {
      expect("from");
      const t = ts[i++];
      if (typeof t?.value !== "string" || !/^["']/.test(t.text)) fail("Use a string module specifier.", top);
      specifier = t.value;
    }
    take(";");
    if (i !== ts.length || !bindings.length) fail("Unsupported or empty module binding.", top);
    if (importing) imports.push({ specifier, bindings, node: top });
    else exports.push(...bindings.map((b) => ({ ...b, specifier, node: top })));
  }
  function erased(ts) {
    let i = 0;
    while (i < ts.length) {
      if (ts[i].text === ";") { i++; continue; }
      const begin = i;
      const exported = ts[i].text === "export";
      if (exported) i++;
      if (ts[i]?.text === "type" && /^[A-Za-z_$][\w$]*$/.test(ts[i + 1]?.text ?? "") && ["=", "<"].includes(ts[i + 2]?.text)) {
        i++;
        const name = ts[i++].text, params = [];
        if (TYPE_BUILTINS.has(name) || aliases.has(name)) fail(`Duplicate or reserved type alias ${name}.`, ts[begin]);
        if (ts[i]?.text === "<") {
          i++;
          while (true) {
            const p = ts[i++];
            if (!p || !/^[A-Za-z_$][\w$]*$/.test(p.text) || TYPE_BUILTINS.has(p.text) || params.includes(p.text)) fail("Generic aliases need distinct simple type parameters.", p ?? ts[begin]);
            params.push(p.text);
            if (ts[i]?.text === ">") { i++; break; }
            if (ts[i++]?.text !== ",") fail("Type parameter constraints and defaults are unsupported.", ts[begin]);
          }
        }
        if (ts[i++]?.text !== "=") fail("Expected = in a type alias.", ts[begin]);
        const start = ts[i]?.start;
        let depth = 0;
        for (; i < ts.length; i++) {
          const text = ts[i].text;
          if (depth === 0 && (text === ";" || ["export", "type", "import", "declare", "interface"].includes(text) && ts[i].start > start)) break;
          if (["{", "[", "(", "<"].includes(text)) depth++;
          if (["}", "]", ")", ">"].includes(text)) depth--;
        }
        if (start === undefined || depth !== 0) fail("Invalid type alias.", ts[begin]);
        const end = ts[i - 1].end;
        const node = { start: ts[begin].start, end };
        aliases.set(name, { id: `${file}#type:${name}`, file, name, params, text: source.slice(start, end), node });
        if (exported) exports.push({ local: name, exported: name, kind: "type", node });
      } else if (ts[begin].text === "import" || exported && ["type", "{"].includes(ts[i]?.text)) {
        i = begin;
        // Module declarations end at their source string or closing list.
        let depth = 0;
        do {
          if (ts[i].text === "{") depth++;
          if (ts[i].text === "}") depth--;
          const done = depth === 0 && (typeof ts[i].value === "string" && /^["']/.test(ts[i].text) || ts[i].text === "}" && ts[i + 1]?.text !== "from");
          i++;
          if (done) break;
        } while (i < ts.length);
        if (ts[i]?.text === ";") i++;
        const part = ts.slice(begin, i);
        moduleBinding(part, { start: part[0].start, end: part.at(-1).end });
      } else fail(`Unsupported erased declaration ${ts[begin].text}. Ambient declarations, interfaces and namespaces are unsupported.`, ts[begin]);
    }
  }
  let cursor = 0;
  for (const top of program.body) {
    erased(within(cursor, top.start));
    if (top.type === "ImportDeclaration" || top.type === "ExportAllDeclaration" || top.type === "ExportNamedDeclaration" && !top.declaration) {
      moduleBinding(within(top.start, top.end), top);
      handled.add(top);
    } else if (top.type === "ExportDefaultDeclaration" && top.declaration.type === "Identifier") {
      exports.push({ local: top.declaration.name, exported: "default", kind: "value", evaluated: true, node: top });
      handled.add(top);
    }
    cursor = top.end;
  }
  erased(within(cursor, source.length));
  return { aliases, imports, exports, handled };
}
