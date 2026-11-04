(** * Printing a Fold.v program as a Foldkit TypeScript module.

    The output imports Effect and Foldkit and exports:

    - [Model]: an Effect Schema Struct.  Flags are [Schema.Boolean]; a
      number field with maximum [max] is
      [Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: max }))];
      an optional number is [Schema.NullOr] of that; a list is
      [Schema.Array(Schema.Struct({ id, label }))] with that Schema for
      [id], a [label] that matches [/^[\x20\x21\x23-\x5B\x5D-\x7E]*$/]
      (all its UTF-16 code units are [safe_char]s), and a filter that
      the ids are unique ([ids_unique]: each item's id is first found at
      its own index);
    - [Message]: a Foldkit message union.  A [PNat max] tag has one field
      [n] with the number Schema above; a [PNone] tag has none;
    - [initialModel] and [flags], the Effect that gives the first model;
    - [init], [update], and [can].

    A program that saves ([saves]) also exports [Saved], the [p_saved]
    fields of [Model] with the same Schemas, and a filter for [p_refs]:
    for each [(o, l)], [saved.o === null] or some item of [saved.l] has
    id [saved.o] ([refs_ok]); the save command,
    [Command.define(p_cmd, ...)], whose Effect encodes its [Saved] argument
    as JSON and writes it under [p_key] in the KeyValueStore, returning
    [p_done], or [p_failed] on any error; and [restore].  Its [flags] reads
    the store and restores the saved fields.  A program that saves nothing
    has none of these, and its [flags] is [initialModel].

    [update] and [can] share one function, [fire].  It switches on the
    message's [_tag].  Each case checks the message against its Schema with
    [Schema.is], then tries the tag's clauses in order: the first whose
    flag conditions, list and option conditions, and guard hold builds the
    next model and the commands.  Any other path returns [undefined], which
    [update] turns into "same model, no commands" and [can] into [false].
    [CSet o] is [model.o !== null]; [CHas l e] is
    [model.l.some((it) => it.id === e)]; [LDrop o] is
    [model.l.filter((it) => it.id !== model.o)], which keeps every item
    when [model.o] is [null], as [leval] does.

    This printer is trusted, like CtxJs.v.  It relies on [fwfb]: every name
    is an identifier that is not one the module defines, so names print
    unquoted and inside double quotes without escaping, and labels are
    JSON-safe, so they print inside double quotes too.  Expressions are
    fully parenthesized.  [EArg] is [n], read from the message only for
    [PNat] tags; [ESub] is [Math.max(0, a - b)].  Numbers in the model and
    in [n] are safe integers by their Schemas; [f_trace_exact] covers what
    is computed from them. *)

From Stdlib Require Import String List Ascii NArith.
From VerifiedListUI Require Import XState XStateCtx CtxJs Fold.
Import ListNotations.
Open Scope string_scope.

Fixpoint ts_expr (e : expr) : string :=
  match e with
  | ENum n => digits n
  | EVar x => "model." ++ x
  | EArg => "n"
  | EAdd a b => "(" ++ ts_expr a ++ " + " ++ ts_expr b ++ ")"
  | ESub a b => "Math.max(0, " ++ ts_expr a ++ " - " ++ ts_expr b ++ ")"
  end.

Fixpoint ts_guard (g : guard) : string :=
  match g with
  | GTrue => "true"
  | GLt a b => "(" ++ ts_expr a ++ " < " ++ ts_expr b ++ ")"
  | GLe a b => "(" ++ ts_expr a ++ " <= " ++ ts_expr b ++ ")"
  | GAnd p r => "(" ++ ts_guard p ++ " && " ++ ts_guard r ++ ")"
  | GNot p => "(!" ++ ts_guard p ++ ")"
  end.

Definition ts_nat (max : N) : string :=
  "Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: " ++ ndigits max ++ " }))".

Definition ts_max (p : program) (x : string) : string :=
  match lookup x (p_max p) with Some m => ts_nat m | None => ts_nat 0 end.

Definition ret (p : program) : string :=
  if saves p then "Return<Model, Message, KeyValueStore.KeyValueStore>"
  else "Return<Model, Message>".

Definition saved_names (p : program) : list string :=
  let s := saved p (p_init p) in
  map fst (m_flags s) ++ map fst (m_nums s) ++ map fst (m_opts s) ++ map fst (m_lists s).

(** A label: printable ASCII other than the double quote and the backslash,
    as [safe_char] says. *)
Definition ts_label : string :=
  "Schema.String.check(Schema.isPattern(/^[\x20\x21\x23-\x5B\x5D-\x7E]*$/))".

(** The Schema of list field [x]. *)
Definition ts_list (p : program) (x : string) : list string :=
  ["  // Ids are unique; labels are printable ASCII other than "" and \.";
   "  " ++ x ++ ": Schema.Array(";
   "    Schema.Struct({";
   "      id: " ++ ts_max p x ++ ",";
   "      label: " ++ ts_label ++ ",";
   "    }),";
   "  ).check(Schema.makeFilter((l) => l.every((it, i) => l.findIndex((o) => o.id === it.id) === i))),"].

(** The filter for [p_refs] on a saved record. *)
Definition ts_ref (r : string * string) : string :=
  "(saved." ++ fst r ++ " === null || saved." ++ snd r ++ ".some((it) => it.id === saved." ++ fst r ++ "))".

(** A list literal. *)
Definition ts_entries (l : list entry) : string :=
  "[" ++ sep ", " (map (fun it => "{ id: " ++ digits (fst it) ++ ", label: " ++ q (snd it) ++ " }") l) ++ "]".

Definition ts_ccond (k : cond) : string :=
  match k with
  | CSet o => "(model." ++ o ++ " !== null)"
  | CHas l e => "model." ++ l ++ ".some((it) => it.id === " ++ ts_expr e ++ ")"
  end.

(** The condition of a clause: its flag conditions, its list and option
    conditions, then its guard. *)
Definition ts_cond (c : clause) : string :=
  let ws := map (fun kv => "(model." ++ fst kv ++ " === " ++ js_bool (snd kv) ++ ")") (cl_when c) in
  let cs := map ts_ccond (cl_conds c) in
  let gs := match cl_guard c with GTrue => [] | g => [ts_guard g] end in
  match (ws ++ cs ++ gs)%list with
  | [] => "true"
  | l => sep " && " l
  end.

(** The next model: every field, in order, new or copied. *)
Definition ts_next (p : program) (c : clause) : string :=
  "{ " ++
  sep ", "
    (map (fun kv => fst kv ++ ": " ++
                    match lookup (fst kv) (cl_flags c) with
                    | Some b => js_bool b
                    | None => "model." ++ fst kv
                    end) (m_flags (p_init p)) ++
     map (fun kv => fst kv ++ ": " ++
                    match lookup (fst kv) (cl_nums c) with
                    | Some e => ts_expr e
                    | None => "model." ++ fst kv
                    end) (m_nums (p_init p)) ++
     map (fun kv => fst kv ++ ": " ++
                    match lookup (fst kv) (cl_opts c) with
                    | Some ONull => "null"
                    | Some (OSome e) => ts_expr e
                    | None => "model." ++ fst kv
                    end) (m_opts (p_init p)) ++
     map (fun kv => fst kv ++ ": " ++
                    match lookup (fst kv) (cl_lists c) with
                    | Some (LLit l) => ts_entries l
                    | Some (LDrop o) => "model." ++ fst kv ++ ".filter((it) => it.id !== model." ++ o ++ ")"
                    | None => "model." ++ fst kv
                    end) (m_lists (p_init p))) ++
  " }".

Definition ts_cmds (p : program) (c : clause) : string :=
  if cl_save c then
    "[" ++ p_cmd p ++ "({ " ++ sep ", " (map (fun x => x ++ ": next." ++ x) (saved_names p)) ++ " })]"
  else "[]".

Definition ts_clause (p : program) (c : clause) : list string :=
  ["      if (" ++ ts_cond c ++ ") {";
   "        const next: Model = " ++ ts_next p c ++ ";";
   "        return { model: next, commands: " ++ ts_cmds p c ++ " };";
   "      }"].

Definition ts_case (p : program) (tc : string * list clause) : list string :=
  let tag := fst tc in
  ["    case " ++ q tag ++ ": {";
   "      if (!Schema.is(Message." ++ tag ++ ")(message)) return undefined;"] ++
  match lookup tag (p_messages p) with
  | Some (PNat _) => ["      const n = message.n;"]
  | _ => []
  end ++
  flat_map (ts_clause p) (snd tc) ++
  ["      return undefined;";
   "    }"].

Definition ts_message (kv : string * payload_schema) : string :=
  "  " ++ fst kv ++ ": " ++
  match snd kv with
  | PNone => "{}"
  | PNat max => "{ n: " ++ ts_nat max ++ " }"
  end ++ ",".

Definition ts_init (p : program) : string :=
  "{ " ++
  sep ", " (map (fun kv => fst kv ++ ": " ++ js_bool (snd kv)) (m_flags (p_init p)) ++
            map (fun kv => fst kv ++ ": " ++ digits (snd kv)) (m_nums (p_init p)) ++
            map (fun kv => fst kv ++ ": " ++
                           match snd kv with Some v => digits v | None => "null" end)
                (m_opts (p_init p)) ++
            map (fun kv => fst kv ++ ": " ++ ts_entries (snd kv)) (m_lists (p_init p))) ++
  " }".

(** The parts only a program that saves has. *)
Definition ts_saved (p : program) : list string :=
  if saves p then
    ["";
     "// The fields the save command stores.";
     "export const Saved = Schema.Struct({"] ++
    map (fun x => "  " ++ x ++ ": Model.fields." ++ x ++ ",") (saved_names p) ++
    match p_refs p with
    | [] => ["});"]
    | rs => ["}).check(Schema.makeFilter((saved) => " ++ sep " && " (map ts_ref rs) ++ "));"]
    end ++
    ["export type Saved = typeof Saved.Type;"]
  else [].

Definition ts_store (p : program) : list string :=
  if saves p then
    ["";
     "const SavedJson = Schema.fromJsonString(Saved);";
     "";
     "export const " ++ p_cmd p ++ " = Command.define(" ++ q (p_cmd p) ++ ", {";
     "  args: Saved.fields,";
     "  messages: [Message." ++ p_done p ++ ", Message." ++ p_failed p ++ "],";
     "  execute: (args) =>";
     "    Effect.gen(function* () {";
     "      const store = yield* KeyValueStore.KeyValueStore;";
     "      const text = yield* Schema.encodeEffect(SavedJson)(args);";
     "      yield* store.set(" ++ q (p_key p) ++ ", text);";
     "      return Message." ++ p_done p ++ "();";
     "    }).pipe(Effect.orElseSucceed(() => Message." ++ p_failed p ++ "())),";
     "});"]
  else [].

Definition ts_flags (p : program) : list string :=
  if saves p then
    ["// The saved fields, if they decode and fit their Schemas, over initialModel.";
     "export const restore = (stored: string | undefined): Model =>";
     "  Option.match(Schema.decodeUnknownOption(SavedJson)(stored), {";
     "    onNone: () => initialModel,";
     "    onSome: (saved) => ({ ...initialModel, ...saved }),";
     "  });";
     "";
     "export const flags = Effect.gen(function* () {";
     "  const store = yield* KeyValueStore.KeyValueStore;";
     "  return restore(yield* store.get(" ++ q (p_key p) ++ "));";
     "}).pipe(Effect.orElseSucceed(() => initialModel));"]
  else
    ["// Nothing is saved: the app always starts from initialModel.";
     "export const flags = Effect.succeed(initialModel);"].

Definition ts_imports (p : program) : list string :=
  if saves p then
    ["import { Effect, Option, Schema } from ""effect"";";
     "import * as KeyValueStore from ""effect/persistence/KeyValueStore"";";
     "import { Command } from ""foldkit"";"]
  else
    ["import { Effect, Schema } from ""effect"";"].

Definition ts_module (header : string) (p : program) : string :=
  lines (
    ["// " ++ header] ++
    ts_imports p ++
    ["import { defineMessageUnion } from ""foldkit/message"";";
     "import type { Return } from ""foldkit/update"";";
     ""] ++
    match p_consts p with
    | [] => []
    | cs => map (fun kv => "export const " ++ fst kv ++ " = " ++ digits (snd kv) ++ ";") cs ++ [""]
    end ++
    ["// Every number in the model is a safe integer between 0 and its maximum.";
     "export const Model = Schema.Struct({"] ++
    map (fun kv => "  " ++ fst kv ++ ": Schema.Boolean,") (m_flags (p_init p)) ++
    map (fun kv => "  " ++ fst kv ++ ": " ++ ts_max p (fst kv) ++ ",") (m_nums (p_init p)) ++
    map (fun kv => "  " ++ fst kv ++ ": Schema.NullOr(" ++ ts_max p (fst kv) ++ "),") (m_opts (p_init p)) ++
    flat_map (fun kv => ts_list p (fst kv)) (m_lists (p_init p)) ++
    ["});";
     "export type Model = typeof Model.Type;"] ++
    ts_saved p ++
    ["";
     "export const Message = defineMessageUnion({"] ++
    map ts_message (p_messages p) ++
    ["});";
     "export type Message = typeof Message.Type;"] ++
    ts_store p ++
    ["";
     "export const initialModel: Model = " ++ ts_init p ++ ";";
     ""] ++
    ts_flags p ++
    ["";
     "export const init = (model: Model): " ++ ret p ++ " => ({ model, commands: [] });";
     "";
     "// The first clause that fires, or undefined.";
     "const fire = (model: Model, message: Message): " ++ ret p ++ " | undefined => {";
     "  switch (message._tag) {"] ++
    flat_map (ts_case p) (p_update p) ++
    ["    default:";
     "      return undefined;";
     "  }";
     "};";
     "";
     "export const update = (model: Model, message: Message): " ++ ret p ++ " =>";
     "  fire(model, message) ?? { model, commands: [] };";
     "";
     "export const can = (model: Model, message: Message): boolean => fire(model, message) !== undefined;"]).
