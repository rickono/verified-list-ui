(** * A model of Foldkit programs.

    Foldkit (https://foldkit.dev) is an Elm-style framework on Effect.  An
    application is a [Model], a union of [Message]s, an [update] function
    [(model, message) -> [model, commands]], and a [view].  The runtime
    keeps the model, runs [view] on it, and folds every message through
    [update].  It runs the returned commands, which are Effects, and their
    results come back as more messages.  So the whole state of the app is
    [fold_left update messages init], which is what [f_run] below says.

    This file models the small subset of Foldkit that FoldTs.v prints:

    - the model has boolean fields ([m_flags]), natural-number fields
      ([m_nums]), optional numbers ([m_opts], [null] or a number), and
      lists of [{ id, label }] records ([m_lists]).  Every number, list
      ids included, has a declared maximum ([p_max]) for its Schema.  The
      Schema of a list also requires its ids to be unique and its labels
      to be printable ASCII other than the double quote and the backslash
      (the characters of [safe_char], Json.v);
    - each message tag has a payload schema, as in XStateCtx.v: [PNone],
      or [PNat max] for an integer field [n] with [0 <= n <= max];
    - [update] is a table from tag to clauses.  The first clause whose
      flag conditions, list and option conditions ([cond]), and guard hold
      fires.  It sets some flags, assigns some numbers (computed from the
      old model, in the expression language of XStateCtx.v), sets some
      optional numbers to [null] or a number, replaces some lists by a
      fixed list or drops the items with a given id, and may issue the one
      command: save the [p_saved] fields of the new model under [p_key] in
      a KeyValueStore.  Fields of every kind can be saved;
    - the initial model is [restore] of what the store holds: the saved
      fields, if they decode, fit their Schemas, and satisfy the program's
      references ([p_refs]: an optional number that, when set, is the id of
      an item of a list), on top of [p_init].  A program that saves nothing
      ([p_saved = []]) has no store, and always starts from [p_init].

    A message that fails its schema, or has no clause that fires, leaves
    the model unchanged and issues no command.  [f_can] says whether it
    would fire; the view uses it to disable buttons.

    What is trusted: that the printed TypeScript does what these functions
    say (FoldTs.v), that the Foldkit runtime folds messages through
    [update] (tests/foldkit and the browser tests check both), and how a
    JavaScript value is read as a [payload] or a stored JSON object
    ([decode_saved]). *)

From Stdlib Require Import String List Bool Arith Ascii NArith.
From VerifiedListUI Require Import XState XStateCtx Json.
Import ListNotations.
Open Scope list_scope.

(** ** Programs *)

(** An item of a list field: [{ id, label }]. *)
Definition entry : Type := nat * string.

Record fmodel := mkModel {
  m_flags : list (string * bool);         (* boolean fields, in order *)
  m_nums : ctx;                           (* number fields, in order *)
  m_opts : list (string * option nat);    (* optional numbers, in order *)
  m_lists : list (string * list entry)    (* list fields, in order *)
}.

(** Conditions on optional numbers and lists. *)
Inductive cond :=
| CSet (o : string)              (* optional number [o] is not null *)
| CHas (l : string) (e : expr).  (* some item of list [l] has id [e] *)

(** New value of an optional number. *)
Inductive oexpr :=
| ONull
| OSome (e : expr).

(** New value of a list field. *)
Inductive lexpr :=
| LLit (l : list entry)          (* this list *)
| LDrop (o : string).            (* the old list without the items whose id
                                    is optional number [o]; all of it if [o]
                                    is null *)

Record clause := mkClause {
  cl_when : list (string * bool);   (* required flag values *)
  cl_guard : guard;                 (* on the number fields and [n] *)
  cl_conds : list cond;             (* on optional numbers and lists *)
  cl_flags : list (string * bool);  (* new flag values *)
  cl_nums : list (string * expr);   (* new numbers, from the old model *)
  cl_opts : list (string * oexpr);  (* new optional numbers, from the old model *)
  cl_lists : list (string * lexpr); (* new lists, from the old model *)
  cl_save : bool                    (* issue the save command *)
}.

Record program := mkProgram {
  p_init : fmodel;
  p_max : list (string * N);        (* number field -> its Schema maximum *)
  p_saved : list string;            (* the fields the save command stores *)
  p_refs : list (string * string);  (* (o, l): optional number [o], when set,
                                       is the id of an item of list [l] *)
  p_key : string;                   (* the KeyValueStore key *)
  p_cmd : string;                   (* the save command's name *)
  p_done : string;                  (* its message when the store succeeds *)
  p_failed : string;                (* its message when the store fails *)
  p_consts : list (string * nat);   (* constants exported for the view *)
  p_messages : list (string * payload_schema);
  p_update : list (string * list clause)
}.

(** A command is the record it saves. *)
Definition cmd := fmodel.

(** ** One message *)

Definition flag (m : fmodel) (x : string) : bool :=
  match lookup x (m_flags m) with Some b => b | None => false end.

Definition when_ok (m : fmodel) (w : list (string * bool)) : bool :=
  forallb (fun kv => Bool.eqb (flag m (fst kv)) (snd kv)) w.

(** Optional number [x] (null if there is no such field). *)
Definition opt (m : fmodel) (x : string) : option nat :=
  match lookup x (m_opts m) with Some v => v | None => None end.

(** List field [x] (empty if there is no such field). *)
Definition entries (m : fmodel) (x : string) : list entry :=
  match lookup x (m_lists m) with Some l => l | None => [] end.

Definition has_id (v : nat) (l : list entry) : bool :=
  existsb (fun it => Nat.eqb (fst it) v) l.

Definition drop_id (v : nat) (l : list entry) : list entry :=
  filter (fun it => negb (Nat.eqb (fst it) v)) l.

Definition ceval (m : fmodel) (arg : nat) (k : cond) : bool :=
  match k with
  | CSet o => match opt m o with Some _ => true | None => false end
  | CHas l e => has_id (eval (m_nums m) arg e) (entries m l)
  end.

Definition fires (m : fmodel) (arg : nat) (c : clause) : bool :=
  when_ok m (cl_when c) && forallb (ceval m arg) (cl_conds c) && geval (m_nums m) arg (cl_guard c).

Fixpoint pick_clause (m : fmodel) (arg : nat) (cs : list clause) : option clause :=
  match cs with
  | [] => None
  | c :: cs' => if fires m arg c then Some c else pick_clause m arg cs'
  end.

Definition set_flags (f s : list (string * bool)) : list (string * bool) :=
  map (fun kv => (fst kv, match lookup (fst kv) s with Some b => b | None => snd kv end)) f.

Definition oeval (m : fmodel) (arg : nat) (e : oexpr) : option nat :=
  match e with ONull => None | OSome e => Some (eval (m_nums m) arg e) end.

Definition leval (m : fmodel) (l : list entry) (e : lexpr) : list entry :=
  match e with
  | LLit l' => l'
  | LDrop o => match opt m o with Some v => drop_id v l | None => l end
  end.

(** Each field [x] of [l] becomes [f x v], where [v] is its old value. *)
Definition upd {A B} (f : string -> A -> B) (l : list (string * A)) : list (string * B) :=
  map (fun kv => (fst kv, f (fst kv) (snd kv))) l.

(** Every field keeps its position.  New values are computed from the old
    model, as the printed [const next: Model = {...}] does. *)
Definition apply_clause (m : fmodel) (arg : nat) (c : clause) : fmodel :=
  mkModel (set_flags (m_flags m) (cl_flags c))
          (assign (m_nums m) arg (cl_nums c))
          (upd (fun x v => match lookup x (cl_opts c) with
                           | Some e => oeval m arg e
                           | None => v
                           end) (m_opts m))
          (upd (fun x l => match lookup x (cl_lists c) with
                           | Some e => leval m l e
                           | None => l
                           end) (m_lists m)).

Definition keep {A} (names : list string) (l : list (string * A)) : list (string * A) :=
  filter (fun kv => memb (fst kv) names) l.

Definition saved (p : program) (m : fmodel) : fmodel :=
  mkModel (keep (p_saved p) (m_flags m)) (keep (p_saved p) (m_nums m))
          (keep (p_saved p) (m_opts m)) (keep (p_saved p) (m_lists m)).

(** Whether the program has a store at all. *)
Definition saves (p : program) : bool :=
  match p_saved p with [] => false | _ => true end.

Definition clauses (p : program) (tag : string) : list clause :=
  match lookup tag (p_update p) with Some cs => cs | None => [] end.

Definition f_step (p : program) (m : fmodel) (tag : string) (arg : nat)
  : option (fmodel * list cmd) :=
  match pick_clause m arg (clauses p tag) with
  | Some c =>
      let m' := apply_clause m arg c in
      Some (m', if cl_save c then [saved p m'] else [])
  | None => None
  end.

(** ** Messages from JavaScript

    A message is a [_tag] and maybe an [n] field, read as a [payload] the
    same way as an XState event (XStateCtx.v).  [f_admits] is the message's
    Schema check, which the printed [update] runs first. *)

Definition f_admits (p : program) (tag : string) (pl : payload) : bool :=
  match lookup tag (p_messages p), pl with
  | Some PNone, _ => true
  | Some (PNat max), PayNat n => N.leb (N.of_nat n) max
  | _, _ => false
  end.

Definition f_fire (p : program) (m : fmodel) (msg : jevent) : option (fmodel * list cmd) :=
  if f_admits p (fst msg) (snd msg) then f_step p m (fst msg) (pay_arg (snd msg)) else None.

(** The printed [update]. *)
Definition f_update (p : program) (m : fmodel) (msg : jevent) : fmodel * list cmd :=
  match f_fire p m msg with Some r => r | None => (m, []) end.

(** The printed [can]. *)
Definition f_can (p : program) (m : fmodel) (msg : jevent) : bool :=
  match f_fire p m msg with Some _ => true | None => false end.

(** What the runtime does with a list of messages. *)
Definition f_run (p : program) (m : fmodel) (msgs : list jevent) : fmodel :=
  fold_left (fun m msg => fst (f_update p m msg)) msgs m.

(** Every command issued along a run, in order. *)
Fixpoint f_cmds (p : program) (m : fmodel) (msgs : list jevent) : list cmd :=
  match msgs with
  | [] => []
  | msg :: msgs' => let r := f_update p m msg in snd r ++ f_cmds p (fst r) msgs'
  end.

(** ** The model's Schema

    [model_fits] says a model is a value of the printed [Model] Schema:
    every number, optional number, and list id is within its field's
    maximum, and each list has unique ids and safe labels. *)

Definition num_fits (p : program) (kv : string * nat) : bool :=
  match lookup (fst kv) (p_max p) with
  | Some max => N.leb (N.of_nat (snd kv)) max
  | None => false
  end.

Definition opt_fits (p : program) (kv : string * option nat) : bool :=
  match snd kv with Some v => num_fits p (fst kv, v) | None => true end.

(** Labels print inside double quotes. *)
Definition entries_ok (l : list entry) : bool :=
  forallb (fun it => all_chars safe_char (snd it)) l.

Fixpoint ids_unique (l : list entry) : bool :=
  match l with
  | [] => true
  | it :: l' => negb (has_id (fst it) l') && ids_unique l'
  end.

Definition list_fits (p : program) (kv : string * list entry) : bool :=
  forallb (fun it => num_fits p (fst kv, fst it)) (snd kv) &&
  entries_ok (snd kv) && ids_unique (snd kv).

Definition model_fits (p : program) (m : fmodel) : bool :=
  forallb (opt_fits p) (m_opts m) && forallb (list_fits p) (m_lists m) &&
  forallb (num_fits p) (m_nums m).

(** The references hold: each optional number of [p_refs] is [null] or
    the id of an item of its list. *)
Definition refs_ok (p : program) (m : fmodel) : bool :=
  forallb (fun r => match opt m (fst r) with
                    | Some v => has_id v (entries m (snd r))
                    | None => true
                    end) (p_refs p).

(** ** Restoring the saved model

    The printed [flags] Effect reads [p_key] from the store and decodes it
    with the [Saved] Schema: JSON, then each saved field with its [Model]
    Schema, then the references.  [decode_saved] is the first half: a JSON
    object with a boolean for each saved flag, a non-negative integer for
    each saved number, [null] or such an integer for each saved optional
    number, and an array of objects with a non-negative integer [id] and a
    string [label] for each saved list, gives the record of those fields
    (other keys are dropped, in the object and in each item).  Anything
    else is [None].  [fits] is the second half: the Schemas and the
    references.  Then the saved fields are spread over [p_init]. *)

Fixpoint get_bools (names : list string) (o : list (string * json))
  : option (list (string * bool)) :=
  match names with
  | [] => Some []
  | x :: names' =>
      match lookup x o, get_bools names' o with
      | Some (JBool b), Some rest => Some ((x, b) :: rest)
      | _, _ => None
      end
  end.

Fixpoint get_nums (names : list string) (o : list (string * json)) : option ctx :=
  match names with
  | [] => Some []
  | x :: names' =>
      match lookup x o, get_nums names' o with
      | Some (JNum n), Some rest => Some ((x, n) :: rest)
      | _, _ => None
      end
  end.

Fixpoint get_opts (names : list string) (o : list (string * json))
  : option (list (string * option nat)) :=
  match names with
  | [] => Some []
  | x :: names' =>
      match lookup x o, get_opts names' o with
      | Some JNull, Some rest => Some ((x, None) :: rest)
      | Some (JNum n), Some rest => Some ((x, Some n) :: rest)
      | _, _ => None
      end
  end.

Definition get_entry (j : json) : option entry :=
  match j with
  | JObj o =>
      match lookup "id"%string o, lookup "label"%string o with
      | Some (JNum n), Some (JStr s) => Some (n, s)
      | _, _ => None
      end
  | _ => None
  end.

Fixpoint get_entries (l : list json) : option (list entry) :=
  match l with
  | [] => Some []
  | j :: l' =>
      match get_entry j, get_entries l' with
      | Some it, Some rest => Some (it :: rest)
      | _, _ => None
      end
  end.

Fixpoint get_lists (names : list string) (o : list (string * json))
  : option (list (string * list entry)) :=
  match names with
  | [] => Some []
  | x :: names' =>
      match lookup x o, get_lists names' o with
      | Some (JArr l), Some rest =>
          match get_entries l with Some es => Some ((x, es) :: rest) | None => None end
      | _, _ => None
      end
  end.

Definition decode_saved (p : program) (j : json) : option fmodel :=
  let s := saved p (p_init p) in
  match j with
  | JObj o =>
      match get_bools (map fst (m_flags s)) o, get_nums (map fst (m_nums s)) o,
            get_opts (map fst (m_opts s)) o, get_lists (map fst (m_lists s)) o with
      | Some f, Some n, Some op, Some ls => Some (mkModel f n op ls)
      | _, _, _, _ => None
      end
  | _ => None
  end.

Fixpoint names_eqb (a b : list string) : bool :=
  match a, b with
  | [], [] => true
  | x :: a', y :: b' => String.eqb x y && names_eqb a' b'
  | _, _ => false
  end.

(** [sm] has exactly the saved fields, in model order, its fields are
    values of their [Model] Schemas, and the references hold. *)
Definition fits (p : program) (sm : fmodel) : bool :=
  let s := saved p (p_init p) in
  names_eqb (map fst (m_flags sm)) (map fst (m_flags s)) &&
  names_eqb (map fst (m_nums sm)) (map fst (m_nums s)) &&
  names_eqb (map fst (m_opts sm)) (map fst (m_opts s)) &&
  names_eqb (map fst (m_lists sm)) (map fst (m_lists s)) &&
  model_fits p sm && refs_ok p sm.

(** Each field of [base], with its value in [s] if [s] has it. *)
Definition over {A} (base s : list (string * A)) : list (string * A) :=
  map (fun kv => (fst kv, match lookup (fst kv) s with Some v => v | None => snd kv end)) base.

(** [{ ...initialModel, ...saved }] *)
Definition merge (m sm : fmodel) : fmodel :=
  mkModel (over (m_flags m) (m_flags sm)) (over (m_nums m) (m_nums sm))
          (over (m_opts m) (m_opts sm)) (over (m_lists m) (m_lists sm)).

(** A program with no store starts from [p_init]; the printed [flags] does
    not read anything. *)
Definition restore (p : program) (st : option fmodel) : fmodel :=
  match st with
  | Some sm => if saves p && fits p sm then merge (p_init p) sm else p_init p
  | None => p_init p
  end.

(** ** Exact arithmetic

    As in XStateCtx.v: [f_vals] lists every number one message can make
    the printed [update] compute, over all the tag's clauses (more than it
    computes, since it stops at the first clause that fires).  [f_exact]
    says they are all safe integers.  Optional numbers and list ids are
    only compared, never computed with; [model_fits] bounds them. *)

Definition cond_vals (c : ctx) (arg : nat) (k : cond) : list nat :=
  match k with CHas _ e => expr_vals c arg e | CSet _ => [] end.

Definition oexpr_vals (c : ctx) (arg : nat) (e : oexpr) : list nat :=
  match e with OSome e => expr_vals c arg e | ONull => [] end.

Definition clause_vals (c : ctx) (arg : nat) (cl : clause) : list nat :=
  guard_vals c arg (cl_guard cl) ++ flat_map (fun kv => expr_vals c arg (snd kv)) (cl_nums cl) ++
  flat_map (cond_vals c arg) (cl_conds cl) ++
  flat_map (fun kv => oexpr_vals c arg (snd kv)) (cl_opts cl).

Definition f_vals (p : program) (m : fmodel) (tag : string) (arg : nat) : list nat :=
  map snd (m_nums m) ++ flat_map (clause_vals (m_nums m) arg) (clauses p tag).

Definition f_exact (p : program) (m : fmodel) (tag : string) (arg : nat) : Prop :=
  forall v, In v (f_vals p m tag arg) -> (N.of_nat v <= max_safe)%N.

Fixpoint f_trace_exact (p : program) (m : fmodel) (msgs : list jevent) : Prop :=
  match msgs with
  | [] => True
  | msg :: msgs' =>
      (f_admits p (fst msg) (snd msg) = true -> f_exact p m (fst msg) (pay_arg (snd msg))) /\
      f_trace_exact p (fst (f_update p m msg)) msgs'
  end.

(** ** Well-formedness side conditions (checked by computation)

    FoldTs.v prints names unquoted, as object keys, after [model.], as
    [const] names, and as [_tag] strings.  So every name is an identifier,
    and none clashes with what the printed module defines itself.  Fields
    are unique across all four kinds, every number, optional number, and
    list has a maximum, and the initial model fits ([model_fits]: so
    labels in printed lists, which are inside double quotes, need no
    escaping).  Clauses read and write only declared fields of the right
    kind, and the clauses of a [PNone] tag do not read [n].  Only declared
    fields are saved.  A reference is from a declared optional number to a
    declared list, both saved, and holds in the initial model.  A program
    that saves something has a key, a command, and the command's result
    messages as declared [PNone] tags; one that saves nothing has no
    clause that saves. *)

Definition reserved : list string :=
  ["Model"; "Saved"; "SavedJson"; "Message"; "initialModel"; "restore"; "flags";
   "init"; "fire"; "update"; "can"; "model"; "message"; "next"; "n"; "it"; "store";
   "text"; "args"; "saved"; "Effect"; "Option"; "Schema"; "KeyValueStore";
   "Command"; "defineMessageUnion"; "Return"; "Math"]%string.

(** Names Effect's Schema reserves on a tagged union ([ValidateVariantNames]). *)
Definition union_reserved : list string :=
  ["make"; "match"; "matchOrElse"; "cases"; "ast"; "members"; "subset"; "guards";
   "isAnyOf"; "Type"; "Encoded"]%string.

Definition upper (c : ascii) : bool :=
  let n := nat_of_ascii c in Nat.leb 65 n && Nat.leb n 90.

Definition tag_ok (s : string) : bool :=
  ident s && negb (memb s union_reserved) &&
  match s with String c _ => upper c | EmptyString => false end.

Definition clause_ok (p : program) (sch : payload_schema) (c : clause) : bool :=
  let fl := map fst (m_flags (p_init p)) in
  let nu := map fst (m_nums (p_init p)) in
  let op := map fst (m_opts (p_init p)) in
  let ls := map fst (m_lists (p_init p)) in
  let no_arg e := match sch with PNone => expr_no_arg e | PNat _ => true end in
  nodupb (map fst (cl_when c)) && forallb (fun kv => memb (fst kv) fl) (cl_when c) &&
  guard_ok nu (cl_guard c) &&
  forallb (fun k => match k with
                    | CSet o => memb o op
                    | CHas l e => memb l ls && expr_ok nu e && no_arg e
                    end) (cl_conds c) &&
  nodupb (map fst (cl_flags c)) && forallb (fun kv => memb (fst kv) fl) (cl_flags c) &&
  nodupb (map fst (cl_nums c)) &&
  forallb (fun kv => memb (fst kv) nu && expr_ok nu (snd kv)) (cl_nums c) &&
  nodupb (map fst (cl_opts c)) &&
  forallb (fun kv => memb (fst kv) op &&
                     match snd kv with ONull => true | OSome e => expr_ok nu e && no_arg e end)
          (cl_opts c) &&
  nodupb (map fst (cl_lists c)) &&
  forallb (fun kv => memb (fst kv) ls &&
                     match snd kv with
                     | LLit l => list_fits p (fst kv, l)
                     | LDrop o => memb o op
                     end) (cl_lists c) &&
  match sch with
  | PNone => guard_no_arg (cl_guard c) && forallb (fun kv => expr_no_arg (snd kv)) (cl_nums c)
  | PNat _ => true
  end &&
  (saves p || negb (cl_save c)).

Definition max_ok (p : program) : bool :=
  names_eqb (map fst (p_max p))
            (map fst (m_nums (p_init p)) ++ map fst (m_opts (p_init p)) ++
             map fst (m_lists (p_init p))) &&
  forallb (fun kv => N.leb (snd kv) max_safe) (p_max p).

(** The save command and its result messages. *)
Definition store_ok (p : program) : bool :=
  ident (p_key p) &&
  ident (p_cmd p) && negb (memb (p_cmd p) reserved) &&
  negb (memb (p_cmd p) (map fst (p_consts p))) &&
  match lookup (p_done p) (p_messages p), lookup (p_failed p) (p_messages p) with
  | Some PNone, Some PNone => negb (String.eqb (p_done p) (p_failed p))
  | _, _ => false
  end.

Definition fwfb (p : program) : bool :=
  let fl := map fst (m_flags (p_init p)) in
  let nu := map fst (m_nums (p_init p)) in
  let op := map fst (m_opts (p_init p)) in
  let ls := map fst (m_lists (p_init p)) in
  let tags := map fst (p_messages p) in
  let names := fl ++ nu ++ op ++ ls in
  nodupb names && forallb ident names && forallb (fun x => negb (memb x reserved)) names &&
  max_ok p && model_fits p (p_init p) &&
  nodupb (p_saved p) && forallb (fun x => memb x names) (p_saved p) &&
  forallb (fun r => memb (fst r) op && memb (snd r) ls &&
                    memb (fst r) (p_saved p) && memb (snd r) (p_saved p)) (p_refs p) &&
  refs_ok p (p_init p) &&
  (negb (saves p) || store_ok p) &&
  nodupb (map fst (p_consts p)) &&
  forallb (fun kv => ident (fst kv) && negb (memb (fst kv) reserved)) (p_consts p) &&
  nodupb tags && forallb tag_ok tags &&
  nodupb (map fst (p_update p)) &&
  forallb (fun tc => match lookup (fst tc) (p_messages p) with
                     | Some sch => forallb (clause_ok p sch) (snd tc)
                     | None => false
                     end) (p_update p).

(** ** Basic facts *)

Lemma update_rejected p m tag pl :
  f_admits p tag pl = false -> f_update p m (tag, pl) = (m, []).
Proof. intros H. unfold f_update, f_fire. cbn [fst snd]. rewrite H. reflexivity. Qed.

Lemma update_no_clauses p m tag pl :
  clauses p tag = [] -> f_update p m (tag, pl) = (m, []).
Proof.
  intros H. unfold f_update, f_fire, f_step. cbn [fst snd]. rewrite H.
  destruct (f_admits p tag pl); reflexivity.
Qed.

Lemma names_eqb_eq a b : names_eqb a b = true -> a = b.
Proof.
  revert b. induction a as [| x a IH]; destruct b as [| y b]; simpl; try discriminate; auto.
  rewrite andb_true_iff, String.eqb_eq. intros [-> H]. f_equal. apply IH, H.
Qed.

Lemma fits_spec p sm :
  fits p sm = true ->
  map fst (m_flags sm) = map fst (m_flags (saved p (p_init p))) /\
  map fst (m_nums sm) = map fst (m_nums (saved p (p_init p))) /\
  map fst (m_opts sm) = map fst (m_opts (saved p (p_init p))) /\
  map fst (m_lists sm) = map fst (m_lists (saved p (p_init p))) /\
  model_fits p sm = true /\ refs_ok p sm = true.
Proof.
  unfold fits. cbv zeta. rewrite !andb_true_iff. intros [[[[[H1 H2] H3] H4] H5] H6].
  repeat split; try (apply names_eqb_eq; assumption); assumption.
Qed.

Lemma has_id_in v l : has_id v l = true <-> In v (map fst l).
Proof.
  unfold has_id. rewrite existsb_exists. split.
  - intros [it [Hin E]]. apply Nat.eqb_eq in E. subst. apply in_map, Hin.
  - intros Hin. apply in_map_iff in Hin as [it [<- Hin]].
    exists it. split; [exact Hin | apply Nat.eqb_refl].
Qed.

Lemma ids_unique_nodup l : ids_unique l = true <-> NoDup (map fst l).
Proof.
  induction l as [| it l IH]; cbn [ids_unique map]; [split; [constructor | reflexivity] |].
  rewrite andb_true_iff, negb_true_iff, IH. split.
  - intros [H1 H2]. constructor; [| exact H2]. intros Hin. apply has_id_in in Hin. congruence.
  - intros H. inversion H as [| ? ? Hn Hd]; subst. split; [| exact Hd].
    destruct (has_id (fst it) l) eqn:E; [| reflexivity]. apply has_id_in in E. contradiction.
Qed.

(** ** Invariants

    A property [P] of the model holds after any messages, from anything
    [restore] returns, if [restore] gives it ([restores]) and every clause
    of [update] keeps it ([keeps]).  That is [fold_keeps].  So proving an
    invariant takes one obligation per clause, about one step on the
    fields, and one about [restore].  The obligations do not mention tags
    nobody declared, payloads that fail their Schema, or the order of the
    clauses: whatever picks a clause, that clause fired. *)

(** Number field [x], as [EVar x] reads it (0 if there is no such field). *)
Definition num (m : fmodel) (x : string) : nat :=
  match lookup x (m_nums m) with Some v => v | None => 0 end.

(** What a tag's Schema says about [n] when it admits the message. *)
Definition arg_ok (sch : option payload_schema) (arg : nat) : Prop :=
  match sch with Some (PNat max) => (N.of_nat arg <= max)%N | _ => True end.

(** Clause [c], of a tag with Schema [sch], keeps [P]: whenever it fires on
    a model where [P] holds, with a payload the Schema admits, [P] holds
    for the new model. *)
Definition clause_keeps (P : fmodel -> Prop) (sch : option payload_schema) (c : clause) : Prop :=
  forall m arg, arg_ok sch arg -> P m -> fires m arg c = true -> P (apply_clause m arg c).

(** Every clause of [p] keeps [P].  For a concrete program, [split_keeps]
    splits this into one [clause_keeps] goal per clause. *)
Definition keeps (P : fmodel -> Prop) (p : program) : Prop :=
  Forall (fun tc => Forall (clause_keeps P (lookup (fst tc) (p_messages p))) (snd tc)) (p_update p).

(** [P] holds for the initial model, and for the initial model with any
    stored record that fits spread over it: for anything [restore] returns. *)
Definition restores (P : fmodel -> Prop) (p : program) : Prop :=
  P (p_init p) /\ forall sm, fits p sm = true -> P (merge (p_init p) sm).

Lemma lookup_some_in {A} k (l : list (string * A)) v : lookup k l = Some v -> In (k, v) l.
Proof.
  induction l as [| [k' v'] l IH]; simpl; [discriminate |].
  destruct (String.eqb_spec k k') as [-> |]; [injection 1 as ->; auto | auto].
Qed.

Lemma pick_clause_some m arg cs c :
  pick_clause m arg cs = Some c -> In c cs /\ fires m arg c = true.
Proof.
  induction cs as [| c' cs IH]; simpl; [discriminate |].
  destruct (fires m arg c') eqn:F.
  - injection 1 as <-. auto.
  - intros H. destruct (IH H). auto.
Qed.

Lemma admits_arg_ok p tag pl :
  f_admits p tag pl = true -> arg_ok (lookup tag (p_messages p)) (pay_arg pl).
Proof.
  unfold f_admits, arg_ok. destruct (lookup tag (p_messages p)) as [[| max] |]; auto.
  destruct pl as [n |]; intros H; [apply N.leb_le, H | discriminate H].
Qed.

(** What one message does: nothing, or one clause of its tag fires, with a
    payload the tag's Schema admits. *)
Lemma update_cases p m msg :
  f_update p m msg = (m, []) \/
  exists c arg,
    In c (clauses p (fst msg)) /\ arg_ok (lookup (fst msg) (p_messages p)) arg /\
    fires m arg c = true /\
    f_update p m msg =
      (apply_clause m arg c, if cl_save c then [saved p (apply_clause m arg c)] else []).
Proof.
  unfold f_update, f_fire, f_step.
  destruct (f_admits p (fst msg) (snd msg)) eqn:A; [| left; reflexivity].
  destruct (pick_clause m (pay_arg (snd msg)) (clauses p (fst msg))) as [c |] eqn:E;
    [| left; reflexivity].
  apply pick_clause_some in E as [Hin Hf]. right. exists c, (pay_arg (snd msg)).
  split; [exact Hin | split; [apply admits_arg_ok, A | split; [exact Hf | reflexivity]]].
Qed.

Lemma keeps_clause P p tag c :
  keeps P p -> In c (clauses p tag) -> clause_keeps P (lookup tag (p_messages p)) c.
Proof.
  unfold keeps, clauses. intros K Hc.
  destruct (lookup tag (p_update p)) as [cs |] eqn:E; [| contradiction].
  apply lookup_some_in in E.
  pose proof (proj1 (Forall_forall _ _) K _ E) as K'. cbn beta in K'.
  exact (proj1 (Forall_forall _ _) K' c Hc).
Qed.

Lemma update_keeps P p m msg : keeps P p -> P m -> P (fst (f_update p m msg)).
Proof.
  intros K Hm. destruct (update_cases p m msg) as [-> | [c [arg [Hc [Ha [Hf ->]]]]]];
    [exact Hm |].
  exact (keeps_clause P p (fst msg) c K Hc m arg Ha Hm Hf).
Qed.

(** From any model where [P] holds, it holds after any messages. *)
Theorem run_keeps P p msgs : forall m, keeps P p -> P m -> P (f_run p m msgs).
Proof.
  unfold f_run. induction msgs as [| msg msgs IH]; simpl; intros m K Hm; [exact Hm |].
  apply IH; [exact K | apply update_keeps; assumption].
Qed.

(** Every command issued along such a run saves a model where [P] holds. *)
Theorem cmds_keep P p msgs : forall m c,
  keeps P p -> P m -> In c (f_cmds p m msgs) -> exists m', P m' /\ c = saved p m'.
Proof.
  induction msgs as [| msg msgs IH]; simpl; intros m c K Hm Hc; [contradiction |].
  apply in_app_or in Hc as [Hc | Hc].
  - destruct (update_cases p m msg) as [E | [c' [arg [Hin [Ha [Hf E]]]]]];
      rewrite E in Hc; simpl in Hc; [contradiction |].
    destruct (cl_save c'); simpl in Hc; [| contradiction].
    destruct Hc as [<- | []]. exists (apply_clause m arg c'). split; [| reflexivity].
    exact (keeps_clause P p (fst msg) c' K Hin m arg Ha Hm Hf).
  - apply (IH (fst (f_update p m msg))); [exact K | apply update_keeps; assumption | exact Hc].
Qed.

Lemma restore_keeps P p st : restores P p -> P (restore p st).
Proof.
  intros [H0 Hm]. destruct st as [sm |]; unfold restore; [| exact H0].
  destruct (saves p && fits p sm) eqn:F; [| exact H0].
  apply andb_true_iff in F as [_ F]. apply Hm, F.
Qed.

(** For every value in the store and every list of messages, with any
    tags and any payloads, [P] holds. *)
Theorem fold_keeps P p st msgs :
  keeps P p -> restores P p -> P (f_run p (restore p st) msgs).
Proof. intros K R. apply run_keeps; [exact K | apply restore_keeps, R]. Qed.

(** And every save issued along the way holds a model where [P] holds. *)
Theorem fold_saves_keep P p st msgs c :
  keeps P p -> restores P p -> In c (f_cmds p (restore p st) msgs) ->
  exists m, P m /\ c = saved p m.
Proof. intros K R. apply cmds_keep; [exact K | apply restore_keeps, R]. Qed.

(** *** Reading fields *)

Lemma lookup_assign c0 arg a x c :
  lookup x (map (fun kv => (fst kv, match lookup (fst kv) a with
                                   | Some e => eval c0 arg e
                                   | None => snd kv
                                   end)) c) =
  match lookup x c with
  | Some v => Some (match lookup x a with Some e => eval c0 arg e | None => v end)
  | None => None
  end.
Proof.
  induction c as [| [y v] c IH]; simpl; [reflexivity |].
  destruct (String.eqb_spec x y) as [-> | _]; [reflexivity | exact IH].
Qed.

(** After a clause, an assigned field holds its expression, read on the old
    model, and any other field keeps its value. *)
Lemma num_apply m arg c x :
  num (apply_clause m arg c) x =
  match lookup x (m_nums m) with
  | Some v => match lookup x (cl_nums c) with Some e => eval (m_nums m) arg e | None => v end
  | None => 0
  end.
Proof.
  unfold num, apply_clause, assign. cbn [m_nums]. rewrite lookup_assign.
  destruct (lookup x (m_nums m)); reflexivity.
Qed.

Lemma lookup_keep {A} names x (l : list (string * A)) :
  memb x names = true -> lookup x (keep names l) = lookup x l.
Proof.
  intros Hx. unfold keep. induction l as [| [y v] l IH]; simpl; [reflexivity |].
  destruct (memb y names) eqn:E; simpl; destruct (String.eqb_spec x y) as [-> | _]; auto.
  rewrite Hx in E. discriminate.
Qed.

Lemma lookup_upd {A B} (f : string -> A -> B) l x :
  lookup x (upd f l) = option_map (f x) (lookup x l).
Proof.
  induction l as [| [y v] l IH]; simpl; [reflexivity |].
  destruct (String.eqb_spec x y) as [-> | _]; [reflexivity | exact IH].
Qed.

(** The same for optional numbers and lists. *)
Lemma opt_apply m arg c x :
  opt (apply_clause m arg c) x =
  match lookup x (m_opts m) with
  | Some v => match lookup x (cl_opts c) with Some e => oeval m arg e | None => v end
  | None => None
  end.
Proof.
  unfold opt, apply_clause. cbn [m_opts]. rewrite lookup_upd.
  destruct (lookup x (m_opts m)); reflexivity.
Qed.

Lemma entries_apply m arg c x :
  entries (apply_clause m arg c) x =
  match lookup x (m_lists m) with
  | Some l => match lookup x (cl_lists c) with Some e => leval m l e | None => l end
  | None => []
  end.
Proof.
  unfold entries, apply_clause. cbn [m_lists]. rewrite lookup_upd.
  destruct (lookup x (m_lists m)); reflexivity.
Qed.

(** A save holds the saved fields as they are in the model. *)
Lemma num_saved p m x : memb x (p_saved p) = true -> num (saved p m) x = num m x.
Proof. intros H. unfold num, saved. cbn [m_nums]. rewrite lookup_keep by exact H. reflexivity. Qed.

(** A number field of a model that fits its Schema is within its maximum. *)
Lemma num_le_max p m x max :
  model_fits p m = true -> lookup x (p_max p) = Some max -> (N.of_nat (num m x) <= max)%N.
Proof.
  unfold model_fits, num. intros H Hx. apply andb_true_iff in H as [_ H].
  destruct (lookup x (m_nums m)) as [v |] eqn:E; [| apply N.le_0_l].
  apply lookup_some_in in E. rewrite forallb_forall in H. specialize (H _ E).
  unfold num_fits in H. cbn [fst snd] in H. rewrite Hx in H. apply N.leb_le, H.
Qed.

Lemma forallb_over {A} (f : string * A -> bool) base s :
  forallb f base = true -> forallb f s = true -> forallb f (over base s) = true.
Proof.
  rewrite !forallb_forall. intros Hb Hs kv Hkv. unfold over in Hkv.
  apply in_map_iff in Hkv as [[x v] [<- Hin]]. cbn [fst snd].
  destruct (lookup x s) as [w |] eqn:E.
  - apply lookup_some_in in E. exact (Hs _ E).
  - exact (Hb _ Hin).
Qed.

(** If the initial model fits its Schema, so does everything [restore]
    returns: a stored field is used only if it fits. *)
Lemma merge_fits p sm :
  model_fits p (p_init p) = true -> fits p sm = true -> model_fits p (merge (p_init p) sm) = true.
Proof.
  intros H0 F. apply fits_spec in F as [_ [_ [_ [_ [F _]]]]].
  unfold model_fits, merge in *. cbn [m_nums m_opts m_lists] in *.
  rewrite !andb_true_iff in *. destruct H0 as [[A B] C]. destruct F as [[D E] G].
  split; [split |]; apply forallb_over; assumption.
Qed.

(** So a property that follows from the Schema bounds needs nothing more
    for [restore]. *)
Lemma restores_fits P p :
  model_fits p (p_init p) = true -> (forall m, model_fits p m = true -> P m) -> restores P p.
Proof.
  intros H0 HP. split; [apply HP, H0 |]. intros sm F. apply HP, merge_fits; assumption.
Qed.

(** [keeps_nums P], for a concrete program and a property [P] of its number
    fields stated with [num], leaves one goal per clause: the old values,
    the guard, and the payload bound give the new values.  [lia] usually
    closes them. *)
Ltac split_keeps :=
  repeat (cbn beta; first [apply Forall_nil | apply Forall_cons]).

Ltac keeps_nums P :=
  unfold keeps; split_keeps;
  let fl := fresh "fl" in let nu := fresh "nu" in let arg := fresh "arg" in
  let Ha := fresh "Ha" in let H := fresh "H" in let F := fresh "F" in
  intros [fl nu op ls] arg Ha H F; unfold fires in F; apply andb_true_iff in F as [_ F];
  unfold P in *; rewrite ?num_apply; unfold num, arg_ok in *;
  cbn -[Nat.ltb Nat.leb Nat.add Nat.sub N.of_nat N.le] in *;
  repeat match goal with |- context [lookup ?x nu] => destruct (lookup x nu) end;
  cbn -[Nat.ltb Nat.leb Nat.add Nat.sub N.of_nat N.le] in *;
  rewrite ?Nat.ltb_lt, ?Nat.leb_le in *.

(** ** The fields never change

    For every program: along every run, the model has exactly the initial
    model's fields, in order.  No obligations. *)

Definition same_fields (p : program) (m : fmodel) : Prop :=
  map fst (m_flags m) = map fst (m_flags (p_init p)) /\
  map fst (m_nums m) = map fst (m_nums (p_init p)) /\
  map fst (m_opts m) = map fst (m_opts (p_init p)) /\
  map fst (m_lists m) = map fst (m_lists (p_init p)).

Lemma apply_fields m arg c :
  map fst (m_flags (apply_clause m arg c)) = map fst (m_flags m) /\
  map fst (m_nums (apply_clause m arg c)) = map fst (m_nums m) /\
  map fst (m_opts (apply_clause m arg c)) = map fst (m_opts m) /\
  map fst (m_lists (apply_clause m arg c)) = map fst (m_lists m).
Proof.
  unfold apply_clause, set_flags, assign, upd. cbn [m_flags m_nums m_opts m_lists].
  rewrite !map_map. repeat split; reflexivity.
Qed.

Lemma merge_fields m sm :
  map fst (m_flags (merge m sm)) = map fst (m_flags m) /\
  map fst (m_nums (merge m sm)) = map fst (m_nums m) /\
  map fst (m_opts (merge m sm)) = map fst (m_opts m) /\
  map fst (m_lists (merge m sm)) = map fst (m_lists m).
Proof. unfold merge, over. cbn [m_flags m_nums m_opts m_lists]. rewrite !map_map. repeat split; reflexivity. Qed.

Theorem fold_fields p st msgs : same_fields p (f_run p (restore p st) msgs).
Proof.
  apply fold_keeps.
  - apply Forall_forall. intros tc _. apply Forall_forall. intros c _ m arg _ [H1 [H2 [H3 H4]]] _.
    destruct (apply_fields m arg c) as [E1 [E2 [E3 E4]]]. repeat split; congruence.
  - split; [repeat split; reflexivity |]. intros sm _. apply merge_fields.
Qed.
