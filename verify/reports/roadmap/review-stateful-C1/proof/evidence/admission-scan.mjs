import { machineOf } from "/tmp/c1-review-stateful/verify/stateful/machine.mjs";
const samples = {
  "nbsp-after-keyword": "// state\u00a0x === 1",
  "zwsp-inside": "// st\u200bate x === 1",
  "zwsp-after": "// state\u200b x === 1",
  "fullwidth-a": "// st\uff41te x === 1",
  "cyrillic-only": "// st\u0430te x === 1",
  "tab": "// state\tx === 1",
  "state-underscore": "// state_ x === 1",
  "double-space-typo": "// st ate x === 1",
};
const tail = "\nlet x = 0;\n// state true\nexport function f(q: number) {}\n";
for (const [id, line] of Object.entries(samples)) {
  const source = line + tail;
  try {
    const m = machineOf(id + ".ts", source);
    console.log(id, "ADMITTED", m.state.map((c) => c.text), m.always.map((c) => c.text));
  } catch (e) {
    console.log(id, e.status || e.constructor.name, e.message);
  }
}
