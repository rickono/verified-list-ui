// Running Rocq on a generated .v file and reading back what it printed.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The value of [Eval vm_compute in s] for a string [s], as Rocq prints it:
//      = "<text, with each " doubled>"
//      : string
export function decodeString(out) {
  const start = out.lastIndexOf('     = "');
  const end = out.lastIndexOf('"\n     : string');
  if (start < 0 || end < start) return null;
  return out.slice(start + 8, end).replaceAll('""', '"');
}

// The FOLD-* lines and the values Rocq printed, in order.  Rocq wraps
// nothing at Printing Width 4000, but a hypothesis can still span lines
// when it holds a newline-free but long term; any line that does not start
// a new record continues the previous one.
export function parseSoft(out) {
  const lines = out.split("\n");
  const res = { wf: null, ts: null, obligations: new Map(), errors: [] };
  let cur = null; // current obligation
  let fail = null; // current failure inside it
  let section = null;
  let last = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "FOLD-WF") {
      section = "wf";
      continue;
    }
    if (line === "FOLD-TS") {
      section = "ts";
      break;
    }
    if (section === "wf" && /^ {5}= (true|false)$/.test(line)) {
      res.wf = line.endsWith("true");
      section = null;
      continue;
    }
    let m;
    if ((m = /^FOLD-OBL (\S+)$/.exec(line))) {
      cur = { name: m[1], failures: [], error: false };
      res.obligations.set(cur.name, cur);
      fail = null;
      last = null;
      continue;
    }
    if (!cur) continue;
    if (line === "FOLD-FAIL") {
      fail = { hyps: [], goal: null };
      cur.failures.push(fail);
      last = null;
    } else if (line === "FOLD-ERR") {
      cur.error = true;
    } else if ((m = /^FOLD-HYP (\S+) : ([\s\S]*)$/.exec(line)) && fail) {
      last = { name: m[1], type: m[2] };
      fail.hyps.push(last);
    } else if ((m = /^FOLD-GOAL ([\s\S]*)$/.exec(line)) && fail) {
      fail.goal = m[1];
      last = "goal";
    } else if (last && line.trim() !== "") {
      if (last === "goal") fail.goal += " " + line.trim();
      else last.type += " " + line.trim();
    }
  }
  const ts = decodeString(out);
  if (ts !== null) res.ts = ts;
  // [match goal] tries the newest hypothesis first.
  for (const o of res.obligations.values()) for (const f of o.failures) f.hyps.reverse();
  return res;
}

export function rocqPaths(opts = {}) {
  const root = opts.root ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  return {
    rocq: opts.rocq ?? path.join(root, "_opam/bin/rocq"),
    theories: opts.theories ?? path.join(root, "_build/default/theories"),
  };
}

// Compile [v] (file name [name].v) in a fresh directory.
export function runRocq(v, { rocq, theories, name = "FoldGen", timeoutMs = 60000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fold-"));
  const file = path.join(dir, `${name}.v`);
  fs.writeFileSync(file, v);
  return new Promise((resolve) => {
    const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? dir };
    const p = spawn(rocq, ["c", "-q", "-Q", theories, "VerifiedListUI", `${name}.v`], { cwd: dir, env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ code: -1, out, err: `${err}${e.message}` });
    });
    p.on("close", (code, signal) => {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ code: signal ? -1 : code, out, err: signal ? `${err}Rocq was stopped after ${timeoutMs} ms.` : err });
    });
  });
}
