(** * JSON encodings shared by the Foldkit oracles.

    A model is the JSON object the printed [Model] Schema describes: flags
    are booleans, numbers are numbers, optional numbers are numbers or
    [null], and lists are arrays of [{ id, label }].  A message is
    [{ _tag, n? }].  The oracles compute every expected value with Fold.v
    ([f_update], [f_can]); these functions only write them down. *)

From Stdlib Require Import String List NArith.
From VerifiedListUI Require Import XState XStateCtx CtxJs Json Fold.
Import ListNotations.
Open Scope list_scope.
Open Scope string_scope.

Definition opt_json (o : option nat) : json :=
  match o with Some n => JNum n | None => JNull end.

Definition entry_json (it : entry) : json := JObj [("id", JNum (fst it)); ("label", JStr (snd it))].

Definition model_json (m : fmodel) : json :=
  JObj (map (fun kv => (fst kv, JBool (snd kv))) (m_flags m) ++
        map (fun kv => (fst kv, JNum (snd kv))) (m_nums m) ++
        map (fun kv => (fst kv, opt_json (snd kv))) (m_opts m) ++
        map (fun kv => (fst kv, JArr (map entry_json (snd kv)))) (m_lists m)).

Definition msg_json (m : jevent) : json :=
  JObj (("_tag", JStr (fst m)) ::
        match snd m with PayNat n => [("n", JNum n)] | PayOther => [] end).

Definition result_json (r : fmodel * list cmd) : json :=
  JObj [("model", model_json (fst r)); ("commands", JArr (map model_json (snd r)))].

(** One message from one model: the expected model, commands, and [can]. *)
Definition step_json (p : program) (m : fmodel) (e : jevent) : json :=
  JObj [("from", model_json m); ("message", msg_json e);
        ("to", result_json (f_update p m e));
        ("can", JBool (f_can p m e))].

(** The result of each message of a run, in order. *)
Fixpoint results (p : program) (m : fmodel) (l : list jevent) : list (fmodel * list cmd) :=
  match l with
  | [] => []
  | e :: l' => let r := f_update p m e in r :: results p (fst r) l'
  end.

(** A run from the initial model. *)
Definition trace_json (p : program) (l : list jevent) : json :=
  JObj [("messages", JArr (map msg_json l));
        ("results", JArr (map result_json (results p (p_init p) l)))].

Definition schema_kind (s : payload_schema) : string :=
  match s with PNone => "none" | PNat _ => "nat" end.

(** Each field's Schema maximum, as a decimal string (it may not be a safe
    integer in general). *)
Definition maxes_json (p : program) : json :=
  JObj (map (fun kv => (fst kv, JStr (ndigits (snd kv)))) (p_max p)).

(** Each message tag, and whether it carries [n]. *)
Definition tags_json (p : program) : json :=
  JObj (map (fun kv => (fst kv, JStr (schema_kind (snd kv)))) (p_messages p)).
