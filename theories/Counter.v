(** * A capped counter: the toy app for XState with context.

    The counter starts at 0.  [Add n] and [Sub n] change it by any amount
    [n]; the cap says the count must always stay below [limit] (500).
    [changes] counts accepted [Add]/[Sub] events since the last [Reset], so
    it is unbounded: the state space is infinite, and the flat compiler in
    Compile.v cannot enumerate it.  While [locked], only [Unlock] does
    anything.

    [enabled s e] says whether [e] is accepted in [s]; a rejected event
    leaves the state unchanged.  The UI disables a button exactly when its
    event is not enabled. *)

From Stdlib Require Import List Arith Bool Lia.
Import ListNotations.

Definition limit : nat := 500.

Record state := mkState {
  locked : bool;
  count : nat;
  changes : nat
}.

Inductive event :=
| Add (n : nat)
| Sub (n : nat)
| Reset
| Lock
| Unlock.

Definition initial : state := mkState false 0 0.

Definition enabled (s : state) (e : event) : bool :=
  match e with
  | Add n => negb (locked s) && Nat.ltb (count s + n) limit
  | Sub n => negb (locked s) && Nat.leb n (count s)
  | Reset | Lock => negb (locked s)
  | Unlock => locked s
  end.

Definition apply (s : state) (e : event) : state :=
  match e with
  | Add n => mkState (locked s) (count s + n) (changes s + 1)
  | Sub n => mkState (locked s) (count s - n) (changes s + 1)
  | Reset => mkState (locked s) 0 0
  | Lock => mkState true (count s) (changes s)
  | Unlock => mkState false (count s) (changes s)
  end.

Definition update (s : state) (e : event) : state :=
  if enabled s e then apply s e else s.

Definition run (s : state) (es : list event) : state := fold_left update es s.

(** ** The cap *)

Definition Inv (s : state) : Prop := count s < limit.

Lemma initial_inv : Inv initial.
Proof. unfold Inv, limit. simpl. lia. Qed.

Lemma update_inv s e : Inv s -> Inv (update s e).
Proof.
  unfold Inv, update, enabled. intros H.
  destruct e; simpl;
    destruct (locked s); simpl; auto;
    try (destruct (Nat.ltb (count s + n) limit) eqn:E; simpl; auto;
         apply Nat.ltb_lt in E; exact E);
    try (destruct (Nat.leb n (count s)); simpl; auto; lia);
    unfold limit; lia.
Qed.

Lemma run_inv s es : Inv s -> Inv (run s es).
Proof.
  revert s; induction es as [| e es IH]; simpl; intros s H; auto.
  apply IH, update_inv, H.
Qed.

(** For every sequence of events, of any length and with any amounts, the
    count stays below 500. *)
Theorem count_below_limit es : count (run initial es) < limit.
Proof. apply run_inv, initial_inv. Qed.

(** Each event raises [changes] by at most one.  CounterMachine.v uses this
    to bound the numbers JavaScript computes. *)
Lemma update_changes s e : changes (update s e) <= changes s + 1.
Proof.
  unfold update. destruct (enabled s e); [destruct e |]; simpl; lia.
Qed.

(** ** Events do what they say *)

Theorem disabled_noop s e : enabled s e = false -> update s e = s.
Proof. unfold update. intros ->. reflexivity. Qed.

Theorem add_enabled_iff s n :
  enabled s (Add n) = true <-> locked s = false /\ count s + n < limit.
Proof.
  simpl. rewrite andb_true_iff, negb_true_iff, Nat.ltb_lt. reflexivity.
Qed.

Theorem add_spec s n :
  enabled s (Add n) = true ->
  update s (Add n) = mkState (locked s) (count s + n) (changes s + 1).
Proof. unfold update. intros ->. reflexivity. Qed.

Theorem sub_enabled_iff s n :
  enabled s (Sub n) = true <-> locked s = false /\ n <= count s.
Proof.
  simpl. rewrite andb_true_iff, negb_true_iff, Nat.leb_le. reflexivity.
Qed.

Theorem locked_only_unlock s e :
  locked s = true -> e <> Unlock -> update s e = s.
Proof.
  intros L N. apply disabled_noop.
  destruct e; simpl; rewrite ?L; try reflexivity. contradiction.
Qed.

(** ** The guard is not too strict, and the state space is infinite *)

(** Every count below the limit is reachable in one step. *)
Theorem every_count_reachable k : k < limit -> count (run initial [Add k]) = k.
Proof.
  intros H. simpl. unfold update. simpl.
  replace (Nat.ltb k limit) with true by (symmetry; apply Nat.ltb_lt, H).
  reflexivity.
Qed.

(** [changes] takes every value, so there are infinitely many reachable
    states. *)
Theorem changes_unbounded k : changes (run initial (repeat (Add 0) k)) = k.
Proof.
  assert (H : forall c j, c < limit ->
            run (mkState false c j) (repeat (Add 0) k) = mkState false c (j + k)).
  { induction k as [| k IH]; intros c j Hc; simpl.
    - rewrite Nat.add_0_r. reflexivity.
    - replace (update (mkState false c j) (Add 0)) with (mkState false c (j + 1)).
      + rewrite IH by exact Hc. f_equal. lia.
      + unfold update. simpl. rewrite Nat.add_0_r.
        replace (Nat.ltb c limit) with true by (symmetry; apply Nat.ltb_lt, Hc).
        reflexivity. }
  unfold initial. rewrite H by (unfold limit; lia). reflexivity.
Qed.
