(** * Printing a machine with context as an XState JavaScript module.

    The output is an ES module that imports XState and Zod.  It exports
    [events], with one Zod schema for each event type in [cm_events], and
    [machine = createMachine({...})].  Guards become arrow functions passed
    as [guard], and assignments become [assign({ field: fn, ... })].  Each
    guard first checks its event against the schema for its type, through
    the Standard Schema interface ([accepts]).  So an event that fails the
    schema is ignored, as [js_step] says.

    This printer is trusted.  It relies on [cwfb]: names are identifiers,
    so they can be printed unquoted or inside double quotes without
    escaping.  Expressions are fully parenthesized, so JavaScript precedence
    cannot change their meaning.  Two printing choices make JavaScript agree
    with [eval]:

    - [EArg] is [(event.n ?? 0)], so an event without a payload reads 0;
    - [ESub] is [Math.max(0, a - b)], which is truncated subtraction.

    The agreement also assumes every number stays a non-negative integer
    below 2^53, where JavaScript numbers are exact.  The schemas make that
    provable for a given machine: see [trace_exact] in XStateCtx.v.

    A [PNat max] schema prints as
    [z.object({ type: z.literal("T"), n: z.number().int().min(0).max(max) })],
    and [PNone] prints as [z.object({ type: z.literal("T") })].  That these
    accept exactly the events that [admits] accepts is trusted.
    tests/counter/payload.test.mjs checks it with Zod 4.6.7. *)

From Stdlib Require Import String List Ascii NArith.
From VerifiedListUI Require Compile.
From VerifiedListUI Require Import XStateCtx.
Import ListNotations.
Open Scope string_scope.

Definition digits := Compile.digits.

Definition nl : string := String (ascii_of_nat 10) EmptyString.

Fixpoint lines (l : list string) : string :=
  match l with
  | [] => ""
  | x :: l' => x ++ nl ++ lines l'
  end.

Fixpoint sep (s : string) (l : list string) : string :=
  match l with
  | [] => ""
  | [x] => x
  | x :: l' => x ++ s ++ sep s l'
  end.

Definition q (s : string) : string := """" ++ s ++ """".

(** Decimal digits of an [N].  The fuel is the number of bits, which is at
    least the number of decimal digits. *)
Fixpoint ndigits_go (fuel : nat) (n : N) (acc : string) : string :=
  match fuel with
  | O => acc
  | S f =>
      let acc' := String (ascii_of_N (48 + N.modulo n 10)) acc in
      if N.ltb n 10 then acc' else ndigits_go f (N.div n 10) acc'
  end.

Definition ndigits (n : N) : string := ndigits_go (S (N.size_nat n)) n "".

Lemma ndigits_examples :
  ndigits 0 = "0" /\ ndigits 9 = "9" /\ ndigits 10 = "10" /\
  ndigits 999999999999999 = "999999999999999" /\
  ndigits 9007199254740991 = "9007199254740991".
Proof. vm_compute. auto. Qed.

Fixpoint js_expr (e : expr) : string :=
  match e with
  | ENum n => digits n
  | EVar x => "context." ++ x
  | EArg => "(event.n ?? 0)"
  | EAdd a b => "(" ++ js_expr a ++ " + " ++ js_expr b ++ ")"
  | ESub a b => "Math.max(0, " ++ js_expr a ++ " - " ++ js_expr b ++ ")"
  end.

Fixpoint js_guard (g : guard) : string :=
  match g with
  | GTrue => "true"
  | GLt a b => "(" ++ js_expr a ++ " < " ++ js_expr b ++ ")"
  | GLe a b => "(" ++ js_expr a ++ " <= " ++ js_expr b ++ ")"
  | GAnd p r => "(" ++ js_guard p ++ " && " ++ js_guard r ++ ")"
  | GNot p => "(!" ++ js_guard p ++ ")"
  end.

Definition args : string := "({ context, event })".

Definition js_assign (a : list (string * expr)) : string :=
  "assign({ " ++
  sep ", " (map (fun kv => fst kv ++ ": " ++ args ++ " => " ++ js_expr (snd kv)) a) ++
  " })".

Definition js_schema (kv : string * payload_schema) : string :=
  "  " ++ fst kv ++ ": z.object({ type: z.literal(" ++ q (fst kv) ++ ")" ++
  match snd kv with
  | PNone => ""
  | PNat max => ", n: z.number().int().min(0).max(" ++ ndigits max ++ ")"
  end ++ " }),".

Definition js_trans (ty : string) (t : trans) : list string :=
  ["          {";
   "            guard: " ++ args ++ " => (accepts(events." ++ ty ++ ", event) && " ++
     js_guard (t_guard t) ++ "),";
   "            target: " ++ q (t_target t) ++ ","] ++
  match t_assign t with
  | [] => []
  | a => ["            actions: " ++ js_assign a ++ ","]
  end ++
  ["          },"].

Definition js_on (ets : string * list trans) : list string :=
  ["        " ++ fst ets ++ ": ["] ++ flat_map (js_trans (fst ets)) (snd ets) ++ ["        ],"].

Definition js_bool (b : bool) : string := if b then "true" else "false".

Definition js_meta (m : list (string * bool)) : string :=
  "{ " ++ sep ", " (map (fun kv => fst kv ++ ": " ++ js_bool (snd kv)) m) ++ " }".

Definition js_node (kn : string * cnode) : list string :=
  ["    " ++ fst kn ++ ": {";
   "      meta: " ++ js_meta (c_meta (snd kn)) ++ ",";
   "      on: {"] ++
  flat_map js_on (c_on (snd kn)) ++
  ["      },";
   "    },"].

Definition js_ctx (c : ctx) : string :=
  "{ " ++ sep ", " (map (fun kv => fst kv ++ ": " ++ digits (snd kv)) c) ++ " }".

Definition js_module (header : string) (m : cmachine) : string :=
  lines (
    ["// " ++ header;
     "import { assign, createMachine } from ""xstate"";";
     "import { z } from ""zod"";";
     "";
     "// One schema for each event type.  Every guard checks its event first.";
     "export const events = {"] ++
    map js_schema (cm_events m) ++
    ["};";
     "";
     "// Standard Schema check.  An async result counts as a failure.";
     "const accepts = (schema, event) => {";
     "  const result = schema[""~standard""].validate(event);";
     "  return !(result instanceof Promise) && result.issues === undefined;";
     "};";
     "";
     "export const machine = createMachine({";
     "  id: " ++ q (cm_id m) ++ ",";
     "  initial: " ++ q (cm_initial m) ++ ",";
     "  context: " ++ js_ctx (cm_context m) ++ ",";
     "  states: {"] ++
    flat_map js_node (cm_states m) ++
    ["  },";
     "});"]).
