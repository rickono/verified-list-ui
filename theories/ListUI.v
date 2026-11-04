(** * Verified list UI: state, events, and transitions.

    The application is a pure reactive system in the style of FRAP
    chapter 17.2.1: [update] is a total state transformer, and the browser
    host performs every external action (rendering) after each step. *)

From Stdlib Require Import String List Arith Bool.
Import ListNotations.

Open Scope string_scope.

Record item := mkItem {
  item_id : nat;
  item_label : string
}.

Record state := mkState {
  items : list item;
  selected : option nat
}.

Inductive event :=
| Select (id : nat)
| DeleteSelected
| Reset.

Definition initial : state :=
  mkState [mkItem 1 "Alpha"; mkItem 2 "Beta"; mkItem 3 "Gamma"] None.

(** [true] iff some item in [l] has ID [id]. *)
Definition mem (id : nat) (l : list item) : bool :=
  existsb (fun it => Nat.eqb (item_id it) id) l.

(** Keep every item whose ID differs from [id], in order. *)
Definition remove_id (id : nat) (l : list item) : list item :=
  filter (fun it => negb (Nat.eqb (item_id it) id)) l.

Definition update (s : state) (e : event) : state :=
  match e with
  | Select id =>
      if mem id (items s) then mkState (items s) (Some id) else s
  | DeleteSelected =>
      match selected s with
      | None => s
      | Some id => mkState (remove_id id (items s)) None
      end
  | Reset => initial
  end.

(** Events are processed left to right against the current state. *)
Definition run (s : state) (es : list event) : state :=
  fold_left update es s.

Definition ids (s : state) : list nat :=
  map item_id (items s).

Definition Valid (s : state) : Prop :=
  NoDup (ids s) /\
  match selected s with
  | None => True
  | Some id => In id (ids s)
  end.

(** ** Required examples, checked by evaluation. *)

Definition alpha := mkItem 1 "Alpha".
Definition beta := mkItem 2 "Beta".
Definition gamma := mkItem 3 "Gamma".

Example ex_no_events :
  run initial [] = mkState [alpha; beta; gamma] None.
Proof. reflexivity. Qed.

Example ex_delete_beta :
  run initial [Select 2; DeleteSelected] = mkState [alpha; gamma] None.
Proof. reflexivity. Qed.

Example ex_select_deleted :
  run initial [Select 2; DeleteSelected; Select 2] = mkState [alpha; gamma] None.
Proof. reflexivity. Qed.

Example ex_reselect_then_delete :
  run initial [Select 1; Select 3; DeleteSelected] = mkState [alpha; beta] None.
Proof. reflexivity. Qed.

Example ex_select_missing :
  run initial [Select 999] = mkState [alpha; beta; gamma] None.
Proof. reflexivity. Qed.

Example ex_delete_all :
  run initial [Select 1; DeleteSelected; Select 2; DeleteSelected;
               Select 3; DeleteSelected] = mkState [] None.
Proof. reflexivity. Qed.

Example ex_double_delete :
  run initial [Select 2; DeleteSelected; DeleteSelected] = mkState [alpha; gamma] None.
Proof. reflexivity. Qed.

Example ex_select_twice :
  run initial [Select 2; Select 2] = mkState [alpha; beta; gamma] (Some 2).
Proof. reflexivity. Qed.

Example ex_examples_then_reset :
  Forall (fun es => run initial (es ++ [Reset]) = initial)
    [ [];
      [Select 2; DeleteSelected];
      [Select 2; DeleteSelected; Select 2];
      [Select 1; Select 3; DeleteSelected];
      [Select 999];
      [Select 1; DeleteSelected; Select 2; DeleteSelected; Select 3; DeleteSelected] ].
Proof. repeat constructor. Qed.

Example ex_reset_twice :
  run initial [Select 1; DeleteSelected; Reset; Reset] = initial.
Proof. reflexivity. Qed.
