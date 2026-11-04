(** * A model of the XState fragment the compiler emits.

    The fragment is a flat machine: no nested or parallel states, no
    context, no guards, no actions, no delays.  Each state node has
    [on: { EVENT_TYPE: "targetKey" }] and an inert [meta] payload.

    [m_step] is our reading of how XState interprets such a machine: look up
    the current state's [on] map by event type; if there is an entry, move
    to its target, otherwise ignore the event.  This reading is trusted, not
    proved.  [wfb] lists the side conditions under which we rely on it, and
    the Node test in tests/xstate checks it exhaustively against the pinned
    XState for the generated machine. *)

From Stdlib Require Import String List Bool Ascii.
From VerifiedListUI Require Import View.
Import ListNotations.
Open Scope list_scope.

Record node := mkNode {
  n_on : list (string * string);   (* event type -> target state key *)
  n_meta : view_t
}.

Record machine := mkMachine {
  m_id : string;
  m_initial : string;
  m_states : list (string * node)  (* state key -> node *)
}.

Fixpoint lookup {A} (k : string) (l : list (string * A)) : option A :=
  match l with
  | [] => None
  | (k', v) :: l' => if String.eqb k k' then Some v else lookup k l'
  end.

Definition m_step (m : machine) (st ev : string) : string :=
  match lookup st (m_states m) with
  | Some n =>
      match lookup ev (n_on n) with
      | Some target => target
      | None => st
      end
  | None => st
  end.

Definition m_run (m : machine) (st : string) (evs : list string) : string :=
  fold_left (m_step m) evs st.

Definition m_meta (m : machine) (st : string) : option view_t :=
  option_map n_meta (lookup st (m_states m)).

(** ** Well-formedness side conditions (checked by computation). *)

Fixpoint nodupb (l : list string) : bool :=
  match l with
  | [] => true
  | x :: l' => negb (existsb (String.eqb x) l') && nodupb l'
  end.

(** Keys are non-empty and use only [A-Za-z0-9_], so XState cannot read
    them as paths ([.]), IDs ([#]), wildcards ([*]), or its own
    [xstate.*] events. *)
Definition plain_char (c : ascii) : bool :=
  let n := nat_of_ascii c in
  (Nat.leb 48 n && Nat.leb n 57) ||   (* 0-9 *)
  (Nat.leb 65 n && Nat.leb n 90) ||   (* A-Z *)
  (Nat.leb 97 n && Nat.leb n 122) ||  (* a-z *)
  Nat.eqb n 95.                       (* _ *)

Fixpoint all_chars (p : ascii -> bool) (s : string) : bool :=
  match s with
  | EmptyString => true
  | String c s' => p c && all_chars p s'
  end.

Definition plain_key (s : string) : bool :=
  negb (String.eqb s EmptyString) && all_chars plain_char s.

Definition wfb (m : machine) : bool :=
  let names := map fst (m_states m) in
  plain_key (m_id m) &&
  nodupb names &&
  forallb plain_key names &&
  existsb (String.eqb (m_initial m)) names &&
  forallb (fun '(_, n) =>
    nodupb (map fst (n_on n)) &&
    forallb (fun '(ev, target) =>
      plain_key ev && existsb (String.eqb target) names) (n_on n))
    (m_states m).

(** ** Generic lookup facts. *)

Lemma lookup_map_some {A B} (f : A -> string) (g : A -> B) l x :
  In x l ->
  (forall y, In y l -> f y = f x -> y = x) ->
  lookup (f x) (map (fun y => (f y, g y)) l) = Some (g x).
Proof.
  induction l as [| a l IH]; simpl; intros Hin Hinj; [contradiction |].
  destruct (String.eqb (f x) (f a)) eqn:E.
  - apply String.eqb_eq in E. rewrite (Hinj a (or_introl eq_refl) (eq_sym E)).
    reflexivity.
  - destruct Hin as [-> | Hin].
    + rewrite String.eqb_refl in E. discriminate.
    + apply IH; auto.
Qed.

Lemma lookup_map_none {A B} (f : A -> string) (g : A -> B) l k :
  (forall y, In y l -> f y <> k) ->
  lookup k (map (fun y => (f y, g y)) l) = None.
Proof.
  induction l as [| a l IH]; simpl; intros Hne; [reflexivity |].
  destruct (String.eqb k (f a)) eqn:E.
  - apply String.eqb_eq in E. exfalso. apply (Hne a); auto.
  - apply IH. auto.
Qed.
