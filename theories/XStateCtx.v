(** * A model of XState machines with context, guards, and assign.

    The flat fragment in XState.v stores the whole application state in the
    state key.  That only works when the reachable state space is finite and
    small.  This fragment adds what XState itself uses for data:

    - [context]: a record of numeric fields next to the state key;
    - [guard]: a condition on the context and the event's [n] payload that
      decides whether a transition may fire;
    - [assign]: new values for some fields, all computed from the old
      context (XState's [assign({...})] with one function per field).

    Guards and assignments are written in a small expression language
    ([expr], [guard]) whose meaning is [eval] and [geval].  CtxJs.v prints
    them as JavaScript.

    Each event type maps to a list of candidate transitions.  [c_step] takes
    the first one whose guard holds, moves to its target, and applies its
    assignment.  If none holds, or the state has no entry for the event
    type, the event is ignored.  As in XState.v, this reading of XState is
    trusted, and tests/counter checks it against the pinned XState.

    [c_step] takes the payload as a [nat].  JavaScript can send any value.
    So each machine also declares an event schema ([cm_events]), and every
    printed guard checks its event against that schema first.  [js_step]
    models that: an event that fails its schema is ignored.  See "Events
    from JavaScript" below. *)

From Stdlib Require Import String List Bool Arith Ascii NArith.
From VerifiedListUI Require Import XState.
Import ListNotations.
Open Scope list_scope.

(** ** Expressions *)

Inductive expr :=
| ENum (n : nat)            (* a constant *)
| EVar (x : string)         (* context.x *)
| EArg                      (* the event's numeric payload, event.n *)
| EAdd (a b : expr)
| ESub (a b : expr).        (* truncated at 0, like nat subtraction *)

Inductive guard :=
| GTrue
| GLt (a b : expr)
| GLe (a b : expr)
| GAnd (p q : guard)
| GNot (p : guard).

Definition ctx := list (string * nat).

Fixpoint eval (c : ctx) (arg : nat) (e : expr) : nat :=
  match e with
  | ENum n => n
  | EVar x => match lookup x c with Some v => v | None => 0 end
  | EArg => arg
  | EAdd a b => eval c arg a + eval c arg b
  | ESub a b => eval c arg a - eval c arg b
  end.

Fixpoint geval (c : ctx) (arg : nat) (g : guard) : bool :=
  match g with
  | GTrue => true
  | GLt a b => Nat.ltb (eval c arg a) (eval c arg b)
  | GLe a b => Nat.leb (eval c arg a) (eval c arg b)
  | GAnd p q => geval c arg p && geval c arg q
  | GNot p => negb (geval c arg p)
  end.

(** ** Machines *)

Record trans := mkTrans {
  t_guard : guard;
  t_target : string;
  t_assign : list (string * expr)   (* field -> new value *)
}.

Record cnode := mkCNode {
  c_on : list (string * list trans);  (* event type -> candidates, in order *)
  c_meta : list (string * bool)
}.

(** What an event type's [n] payload must be.  CtxJs.v prints each one as a
    Zod schema. *)
Inductive payload_schema :=
| PNone             (* no transition reads [n], so any value is allowed *)
| PNat (max : N).   (* [n] is an integer with 0 <= n <= max *)

Record cmachine := mkCMachine {
  cm_id : string;
  cm_initial : string;
  cm_context : ctx;
  cm_events : list (string * payload_schema);  (* event type -> schema *)
  cm_states : list (string * cnode)
}.

(** A snapshot is XState's [value] and [context]; an event is its [type]
    and its numeric payload [n] (0 when absent). *)
Definition snapshot := (string * ctx)%type.
Definition cevent := (string * nat)%type.

Definition c_init (m : cmachine) : snapshot := (cm_initial m, cm_context m).

(** Every field keeps its position; assigned fields get their new value,
    computed from the old context. *)
Definition assign (c : ctx) (arg : nat) (a : list (string * expr)) : ctx :=
  map (fun kv => (fst kv, match lookup (fst kv) a with
                          | Some e => eval c arg e
                          | None => snd kv
                          end)) c.

Fixpoint select (c : ctx) (arg : nat) (ts : list trans) : option trans :=
  match ts with
  | [] => None
  | t :: ts' => if geval c arg (t_guard t) then Some t else select c arg ts'
  end.

Definition candidates (m : cmachine) (st : snapshot) (ty : string) : list trans :=
  match lookup (fst st) (cm_states m) with
  | Some n => match lookup ty (c_on n) with Some ts => ts | None => [] end
  | None => []
  end.

Definition c_step (m : cmachine) (st : snapshot) (ev : cevent) : snapshot :=
  match select (snd st) (snd ev) (candidates m st (fst ev)) with
  | Some t => (t_target t, assign (snd st) (snd ev) (t_assign t))
  | None => st
  end.

(** XState's [snapshot.can(event)]: some transition would be taken. *)
Definition c_can (m : cmachine) (st : snapshot) (ev : cevent) : bool :=
  match select (snd st) (snd ev) (candidates m st (fst ev)) with
  | Some _ => true
  | None => false
  end.

Definition c_run (m : cmachine) (st : snapshot) (evs : list cevent) : snapshot :=
  fold_left (c_step m) evs st.

Definition c_meta_of (m : cmachine) (st : snapshot) : option (list (string * bool)) :=
  option_map c_meta (lookup (fst st) (cm_states m)).

(** ** Events from JavaScript

    A JavaScript event has a [type] and maybe an [n] field.  [payload] is
    the part of [n] that matters: [PayNat n] when [n] is a number that is a
    non-negative integer (JavaScript's -0 is 0), and [PayOther] for all other
    values (missing, [undefined], [null], negative, fractional, NaN,
    Infinity, strings, objects, ...).  Reading a JavaScript value this way
    is trusted, and tests/counter/payload.test.mjs checks it.

    [admits] is the schema check.  The printed module runs it, through
    Zod and the Standard Schema interface, at the start of every guard.  So
    an event that fails it is ignored: [js_step] returns the same snapshot,
    and [js_can] is false. *)

Inductive payload := PayNat (n : nat) | PayOther.
Definition jevent := (string * payload)%type.

Definition admits (m : cmachine) (ty : string) (p : payload) : bool :=
  match lookup ty (cm_events m), p with
  | Some PNone, _ => true
  | Some (PNat max), PayNat n => N.leb (N.of_nat n) max
  | _, _ => false
  end.

(** The payload that the guards and the assignments read.  For a [PNone]
    type, [cwfb] makes sure that nothing reads it. *)
Definition pay_arg (p : payload) : nat :=
  match p with PayNat n => n | PayOther => 0 end.

Definition js_step (m : cmachine) (st : snapshot) (ev : jevent) : snapshot :=
  if admits m (fst ev) (snd ev) then c_step m st (fst ev, pay_arg (snd ev)) else st.

Definition js_can (m : cmachine) (st : snapshot) (ev : jevent) : bool :=
  admits m (fst ev) (snd ev) && c_can m st (fst ev, pay_arg (snd ev)).

Definition js_run (m : cmachine) (st : snapshot) (evs : list jevent) : snapshot :=
  fold_left (js_step m) evs st.

(** ** Exact arithmetic

    JavaScript numbers are doubles.  They agree with [nat] for integers up
    to [max_safe] (Number.MAX_SAFE_INTEGER).  [step_vals] lists every number
    a step can compute: the context, and each subexpression of every
    candidate guard and assignment.  This is more than XState computes,
    because XState stops at the first passing guard.  [exact] says that all
    of them are at most [max_safe].  The subtraction in [ESub] can be
    negative in JavaScript before [Math.max], but its size is at most the
    larger operand, so it is exact too. *)

Definition max_safe : N := 9007199254740991.

Fixpoint expr_vals (c : ctx) (arg : nat) (e : expr) : list nat :=
  eval c arg e ::
  match e with
  | EAdd a b | ESub a b => expr_vals c arg a ++ expr_vals c arg b
  | _ => []
  end.

Fixpoint guard_vals (c : ctx) (arg : nat) (g : guard) : list nat :=
  match g with
  | GTrue => []
  | GLt a b | GLe a b => expr_vals c arg a ++ expr_vals c arg b
  | GAnd p q => guard_vals c arg p ++ guard_vals c arg q
  | GNot p => guard_vals c arg p
  end.

Definition trans_vals (c : ctx) (arg : nat) (t : trans) : list nat :=
  guard_vals c arg (t_guard t) ++ flat_map (fun kv => expr_vals c arg (snd kv)) (t_assign t).

Definition step_vals (m : cmachine) (st : snapshot) (ev : cevent) : list nat :=
  map snd (snd st) ++ flat_map (trans_vals (snd st) (snd ev)) (candidates m st (fst ev)).

Definition exact (m : cmachine) (st : snapshot) (ev : cevent) : Prop :=
  forall v, In v (step_vals m st ev) -> (N.of_nat v <= max_safe)%N.

(** Every step of a run from [st] that passes the schema is exact. *)
Fixpoint trace_exact (m : cmachine) (st : snapshot) (evs : list jevent) : Prop :=
  match evs with
  | [] => True
  | ev :: evs' =>
      (admits m (fst ev) (snd ev) = true -> exact m st (fst ev, pay_arg (snd ev))) /\
      trace_exact m (js_step m st ev) evs'
  end.

(** ** Well-formedness side conditions (checked by computation)

    Every name the printer writes unquoted, as an object key or after
    [context.], is an identifier: a letter, then [A-Za-z0-9_].  That keeps
    out [__proto__], paths, and XState's reserved event types.  Expressions
    read only declared fields, so JavaScript never reads [undefined].  Every
    event type a state handles has a schema, and the transitions of a
    [PNone] type do not read [n]. *)

Definition letter (c : ascii) : bool :=
  let n := nat_of_ascii c in
  (Nat.leb 65 n && Nat.leb n 90) || (Nat.leb 97 n && Nat.leb n 122).

Definition ident (s : string) : bool :=
  match s with
  | EmptyString => false
  | String c _ => letter c && all_chars plain_char s
  end.

Definition memb (x : string) (l : list string) : bool := existsb (String.eqb x) l.

Fixpoint expr_ok (fields : list string) (e : expr) : bool :=
  match e with
  | ENum _ | EArg => true
  | EVar x => memb x fields
  | EAdd a b | ESub a b => expr_ok fields a && expr_ok fields b
  end.

Fixpoint guard_ok (fields : list string) (g : guard) : bool :=
  match g with
  | GTrue => true
  | GLt a b | GLe a b => expr_ok fields a && expr_ok fields b
  | GAnd p q => guard_ok fields p && guard_ok fields q
  | GNot p => guard_ok fields p
  end.

Fixpoint expr_no_arg (e : expr) : bool :=
  match e with
  | EArg => false
  | EAdd a b | ESub a b => expr_no_arg a && expr_no_arg b
  | ENum _ | EVar _ => true
  end.

Fixpoint guard_no_arg (g : guard) : bool :=
  match g with
  | GTrue => true
  | GLt a b | GLe a b => expr_no_arg a && expr_no_arg b
  | GAnd p q => guard_no_arg p && guard_no_arg q
  | GNot p => guard_no_arg p
  end.

Definition trans_no_arg (t : trans) : bool :=
  guard_no_arg (t_guard t) && forallb (fun kv => expr_no_arg (snd kv)) (t_assign t).

Definition on_ok (events : list (string * payload_schema)) (ets : string * list trans) : bool :=
  match lookup (fst ets) events with
  | Some PNone => forallb trans_no_arg (snd ets)
  | Some (PNat _) => true
  | None => false
  end.

Definition trans_ok (names fields : list string) (t : trans) : bool :=
  guard_ok fields (t_guard t) &&
  memb (t_target t) names &&
  nodupb (map fst (t_assign t)) &&
  forallb (fun kv => memb (fst kv) fields && expr_ok fields (snd kv)) (t_assign t).

Definition cwfb (m : cmachine) : bool :=
  let names := map fst (cm_states m) in
  let fields := map fst (cm_context m) in
  ident (cm_id m) &&
  nodupb names && forallb ident names && memb (cm_initial m) names &&
  nodupb fields && forallb ident fields &&
  nodupb (map fst (cm_events m)) && forallb (fun kv => ident (fst kv)) (cm_events m) &&
  forallb (fun kn =>
    let n := snd kn in
    nodupb (map fst (c_on n)) &&
    forallb (fun ets => ident (fst ets) && on_ok (cm_events m) ets &&
                        forallb (trans_ok names fields) (snd ets)) (c_on n) &&
    nodupb (map fst (c_meta n)) && forallb (fun kv => ident (fst kv)) (c_meta n))
    (cm_states m).
