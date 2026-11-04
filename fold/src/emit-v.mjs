// The generated .v file: the program, its well-formedness, the printed
// TypeScript, and one lemma per obligation of each invariant.
//
// strict: every lemma ends in Qed, so a failed proof fails the build (dune).
// soft:   every obligation is tried and Admitted, printing FOLD-* lines that
//         rocq.mjs reads back into diagnostics (the content mapper).

import { FoldError } from "./lex.mjs";

const str = (s) => `"${s.replaceAll('"', '""')}"`;
const list = (xs) => `[${xs.join("; ")}]`;
const pair = (a, b) => `(${a}, ${b})`;
const nat = (v) => `${v}`;
const N = (v) => `${v}%N`;

function expr(e) {
  switch (e.k) {
    case "num":
      return `(ENum ${nat(e.v)})`;
    case "var":
      return `(EVar ${str(e.x)})`;
    case "arg":
      return "EArg";
    case "add":
      return `(EAdd ${expr(e.a)} ${expr(e.b)})`;
    case "sub":
      return `(ESub ${expr(e.a)} ${expr(e.b)})`;
  }
  throw new Error(`expr ${e.k}`);
}

function guard(g) {
  switch (g.k) {
    case "true":
      return "GTrue";
    case "lt":
      return `(GLt ${expr(g.a)} ${expr(g.b)})`;
    case "le":
      return `(GLe ${expr(g.a)} ${expr(g.b)})`;
    case "and":
      return `(GAnd ${guard(g.a)} ${guard(g.b)})`;
    case "not":
      return `(GNot ${guard(g.a)})`;
  }
  throw new Error(`guard ${g.k}`);
}

const cond = (c) => (c.k === "set" ? `(CSet ${str(c.o)})` : `(CHas ${str(c.l)} ${expr(c.e)})`);
const oexpr = (o) => (o.k === "null" ? "ONull" : `(OSome ${expr(o.e)})`);
const entries = (l) => list(l.map(([id, label]) => pair(nat(id), str(label))));
const lexpr = (l) => (l.k === "drop" ? `(LDrop ${str(l.o)})` : `(LLit ${entries(l.v)})`);
const schema = (s) => (s.k === "none" ? "PNone" : `(PNat ${N(s.max)})`);

function clauseTerm(c) {
  return [
    "mkClause",
    list(c.when.map(([f, b]) => pair(str(f), `${b}`))),
    guard(c.guard),
    list(c.conds.map(cond)),
    list(c.flags.map(([f, b]) => pair(str(f), `${b}`))),
    list(c.nums.map(([x, e]) => pair(str(x), expr(e)))),
    list(c.opts.map(([x, o]) => pair(str(x), oexpr(o)))),
    list(c.lists.map(([x, l]) => pair(str(x), lexpr(l)))),
    `${c.save}`,
  ].join(" ");
}

export function programTerm(ir) {
  const st = ir.store ?? { key: "", cmd: "", done: "", failed: "" };
  return [
    "mkProgram",
    `    (mkModel ${list(ir.flags.map((f) => pair(str(f.name), `${f.init}`)))}`,
    `             ${list(ir.nums.map((f) => pair(str(f.name), nat(f.init))))}`,
    `             ${list(ir.opts.map((f) => pair(str(f.name), f.init === null ? "None" : `(Some ${nat(f.init)})`)))}`,
    `             ${list(ir.lists.map((f) => pair(str(f.name), entries(f.init))))})`,
    `    ${list(ir.maxes.map(([x, m]) => pair(str(x), N(m))))}`,
    `    ${list(ir.saved.map(str))} ${list(ir.refs.map(([o, l]) => pair(str(o), str(l))))}`,
    `    ${str(st.key)} ${str(st.cmd)} ${str(st.done)} ${str(st.failed)}`,
    `    ${list(ir.consts.map((c) => pair(str(c.name), nat(c.value))))}`,
    `    ${list(ir.messages.map(([t, s]) => pair(str(t), schema(s))))}`,
    `    ${list(ir.update.map(([t, cs]) => pair(str(t), list(cs.map((c) => `clause_${c.id}`)))))}`,
  ].join("\n");
}

// Proof scripts.  Each is a list of tactic sentences; strict mode runs them
// as sentences, soft mode joins them with ";" inside [first [...]].

function clauseScript(ir, inv, c) {
  const s = ["clause_start", "cbn in Sf, Sn"];
  for (const f of ir.flags) s.push(`peel fl Sf model_${f.name}`);
  s.push("peel_end fl Sf");
  for (const f of ir.nums) s.push(`peel nu Sn model_${f.name}`);
  s.push("peel_end nu Sn");
  s.push(`unfold Q_${inv.name} in *`);
  const split = new Set([...c.when.map(([f]) => f), ...inv.flags]);
  const ds = ir.flags.filter((f) => split.has(f.name)).map((f) => `model_${f.name}`);
  if (ds.length) s.push(`destruct ${ds.join(", ")}`);
  s.push("fold_simpl", "try discriminate");
  return s;
}

function storedScript(ir, inv) {
  const savedFlags = ir.flags.filter((f) => f.saved);
  const savedNums = ir.nums.filter((f) => f.saved);
  const s = ["stored_start", "cbn in Ef, En"];
  for (const f of savedFlags) s.push(`peel sfl Ef stored_${f.name}`);
  s.push("peel_end sfl Ef");
  for (const f of savedNums) s.push(`peel snu En stored_${f.name}`);
  s.push("peel_end snu En");
  s.push("bounds M", `unfold Q_${inv.name}`);
  const ds = savedFlags.filter((f) => inv.flags.includes(f.name)).map((f) => `stored_${f.name}`);
  if (ds.length) s.push(`destruct ${ds.join(", ")}`);
  s.push("fold_simpl");
  return s;
}

const initScript = (inv) => [`unfold Q_${inv.name}`, "fold_simpl"];

// The obligations of every invariant, in order, with where to report them.
export function obligations(ir) {
  const out = [];
  const names = new Set();
  const add = (o) => {
    if (names.has(o.lemma)) {
      const n = o.inv.node.nameSpan;
      throw new FoldError(`The generated lemma name ${o.lemma} is ambiguous. Rename this invariant.`, n.start, n.end, 2);
    }
    names.add(o.lemma);
    out.push(o);
  };
  for (const inv of ir.invariants) {
    for (const lemma of [`Q_${inv.name}`, `restores_${inv.name}`, `keeps_${inv.name}`, `${inv.name}_always`, `${inv.name}_saves`]) {
      add({ lemma, inv, composite: true });
    }
    for (const c of ir.clauses) {
      const sch = ir.messages.find(([t]) => t === c.tag)[1];
      add({
        kind: "clause",
        lemma: `keeps_${inv.name}_${c.id}`,
        inv,
        clause: c,
        statement: `clause_keeps (holds app Q_${inv.name}) (Some ${schema(sch)}) clause_${c.id}`,
        script: clauseScript(ir, inv, c),
      });
    }
    add({ kind: "init", lemma: `init_${inv.name}`, inv, statement: `Q_${inv.name} (p_init app)`, script: initScript(inv) });
    add({
      kind: "stored",
      lemma: `stored_${inv.name}`,
      inv,
      statement: `forall sm, fits app sm = true -> Q_${inv.name} (merge (p_init app) sm)`,
      script: storedScript(ir, inv),
    });
  }
  return out.filter((o) => !o.composite);
}

const HEAD = `From Stdlib Require Import String List Bool Arith NArith ZArith Lia.
From VerifiedListUI Require Import XState XStateCtx Fold FoldTs FoldAuto.
Import ListNotations.
Open Scope list_scope.
Open Scope string_scope.
`;

const tsHeader = (meta) =>
  `Generated by Rocq from ${meta.file} (sha256 ${meta.sha}) by fold/ (printer: theories/FoldTs.v). Do not edit.`;

export function emitV(ir, meta, mode = "strict") {
  const out = [];
  out.push(`(* Generated by fold/ from ${meta.file} (sha256 ${meta.sha}). Do not edit. *)`, "", HEAD);
  for (const c of ir.clauses) out.push(`Definition clause_${c.id} : clause :=\n  ${clauseTerm(c)}.`);
  out.push("", `Definition app : program :=\n  ${programTerm(ir)}.`, "");
  out.push(`Definition ts : string :=\n  ts_module ${str(tsHeader(meta))} app.`, "");
  for (const inv of ir.invariants) out.push(`Definition Q_${inv.name} (m : fmodel) : Prop := ${inv.prop}.`);
  out.push("");
  const obls = obligations(ir);

  if (mode === "soft") {
    out.push("Set Printing Width 4000.", 'Goal True. idtac "FOLD-WF". Abort.', "Eval vm_compute in fwfb app.", "");
    for (const o of obls) {
      const pre = o.script.join("; ");
      out.push(
        `Lemma ${o.lemma} : ${o.statement}.`,
        `Proof. idtac "FOLD-OBL ${o.lemma}". first [ solve [ ${pre}; lia ] | ${pre}; first [ lia | fold_report ] | idtac "FOLD-ERR" ]. Admitted.`,
        "",
      );
    }
    out.push('Goal True. idtac "FOLD-TS". Abort.', "Eval vm_compute in ts.", "");
    return out.join("\n");
  }

  out.push("Lemma wf : fwfb app = true.\nProof. vm_compute. reflexivity. Qed.", "");
  for (const o of obls) {
    // One goal until the case split; from there on, every case.
    const k = o.script.findIndex((t) => t.startsWith("destruct ") || t === "fold_simpl");
    const head = o.script.slice(0, k).map((t) => `  ${t}.`).join("\n");
    const tail = [...o.script.slice(k), "lia"].join("; ");
    out.push(`Lemma ${o.lemma} : ${o.statement}.`, `Proof.\n${head}\n  ${tail}.\nQed.`, "");
  }
  for (const inv of ir.invariants) {
    const X = inv.name;
    out.push(
      `Lemma restores_${X} : restores (holds app Q_${X}) app.`,
      `Proof. apply restores_holds; [exact init_${X} | exact stored_${X}]. Qed.`,
      "",
      `Lemma keeps_${X} : keeps (holds app Q_${X}) app.`,
      `Proof.\n  unfold keeps; split_keeps.\n${ir.clauses.map((c) => `  exact keeps_${X}_${c.id}.`).join("\n")}\nQed.`,
      "",
      `(** [${X}] holds after any messages, from any stored value. *)`,
      `Theorem ${X}_always st msgs : Q_${X} (f_run app (restore app st) msgs).`,
      `Proof. exact (fold_holds app Q_${X} st msgs keeps_${X} restores_${X}). Qed.`,
      "",
    );
    if (ir.saved.length) {
      out.push(
        `(** And every save holds a model where [${X}] holds. *)`,
        `Theorem ${X}_saves st msgs c :`,
        `  In c (f_cmds app (restore app st) msgs) -> exists m, Q_${X} m /\\ c = saved app m.`,
        `Proof. exact (fold_holds_saves app Q_${X} st msgs c keeps_${X} restores_${X}). Qed.`,
        "",
      );
    }
  }
  return out.join("\n");
}
