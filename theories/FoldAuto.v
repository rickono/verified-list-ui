(** * Proof support for programs written in [.fold] files.

    A [.fold] file is a Fold.v program in TypeScript-flavored syntax, with
    the invariants it should keep.  [fold/] (untrusted JavaScript) turns it
    into a [.v] file: the program as a [Definition], one lemma per (rule,
    invariant) pair, one for [restore], and the theorem that the invariant
    holds after any messages from any stored value.  The lemmas use the
    tactics below.  Nothing here is trusted: a wrong tactic only fails a
    proof.

    An invariant [Q] is a [Prop] about the number and boolean fields of a
    model.  [fold_keeps] (Fold.v) needs every clause to keep it on every
    model, including models with missing fields, where a field reads as 0
    or [false].  That is harder than it should be: "[a] and [b] are equal"
    is kept by a clause that adds 1 to both, except on a model with no [b].
    So the generated proofs use [holds p Q], which is [Q] and
    [same_fields p] together.  Every model along a run has the program's
    fields ([fold_fields]), so each clause obligation starts from a model
    whose fields are known by name.  [peel] names them. *)

From Stdlib Require Import String List Bool Arith NArith ZArith Lia.
From VerifiedListUI Require Import XState XStateCtx Fold.
Import ListNotations.
Open Scope list_scope.

(** A flag as a proposition: [cbn] turns [bt true] into [True] and
    [bt false] into [False], which [lia] understands. *)
Definition bt (b : bool) : Prop := if b then True else False.

(** A guard as a proposition, for [lia]. *)
Fixpoint gprop (c : ctx) (arg : nat) (g : guard) : Prop :=
  match g with
  | GTrue => True
  | GLt a b => eval c arg a < eval c arg b
  | GLe a b => eval c arg a <= eval c arg b
  | GAnd p q => gprop c arg p /\ gprop c arg q
  | GNot p => ~ gprop c arg p
  end.

Lemma geval_prop c arg g : geval c arg g = true <-> gprop c arg g.
Proof.
  induction g as [| a b | a b | p IHp q IHq | p IHp]; cbn.
  - split; auto.
  - apply Nat.ltb_lt.
  - apply Nat.leb_le.
  - rewrite andb_true_iff, IHp, IHq. reflexivity.
  - rewrite negb_true_iff, <- IHp. destruct (geval c arg p); split; congruence.
Qed.

(** ** Invariants on models with the program's fields *)

Definition holds (p : program) (Q : fmodel -> Prop) (m : fmodel) : Prop :=
  same_fields p m /\ Q m.

(** A clause keeps [holds p Q] if it keeps [Q] on models with [p]'s fields. *)
Lemma clause_holds p Q sch c :
  (forall m arg, arg_ok sch arg -> same_fields p m -> Q m -> fires m arg c = true ->
                 Q (apply_clause m arg c)) ->
  clause_keeps (holds p Q) sch c.
Proof.
  intros K m arg Ha [S HQ] F. split; [| apply K; assumption].
  destruct (apply_fields m arg c) as [E1 [E2 [E3 E4]]]. destruct S as [S1 [S2 [S3 S4]]].
  repeat split; congruence.
Qed.

(** [restore] gives [holds p Q] if [Q] holds for the initial model and for
    every stored record that fits, spread over it. *)
Lemma restores_holds p Q :
  Q (p_init p) -> (forall sm, fits p sm = true -> Q (merge (p_init p) sm)) ->
  restores (holds p Q) p.
Proof.
  intros H0 Hm. split.
  - split; [repeat split; reflexivity | exact H0].
  - intros sm F. split; [apply merge_fields | apply Hm, F].
Qed.

(** For every value in the store and every list of messages, [Q] holds. *)
Theorem fold_holds p Q st msgs :
  keeps (holds p Q) p -> restores (holds p Q) p -> Q (f_run p (restore p st) msgs).
Proof. intros K R. exact (proj2 (fold_keeps _ p st msgs K R)). Qed.

(** And every save issued along the way holds a model where [Q] holds. *)
Theorem fold_holds_saves p Q st msgs c :
  keeps (holds p Q) p -> restores (holds p Q) p -> In c (f_cmds p (restore p st) msgs) ->
  exists m, Q m /\ c = saved p m.
Proof.
  intros K R H. destruct (fold_saves_keep _ p st msgs c K R H) as [m [[_ Hm] E]].
  exists m. split; assumption.
Qed.

(** ** Tactics

    [peel l E v]: [E : map fst l = x :: xs].  Replaces [l] by
    [(x, v) :: l] and leaves [E : map fst l = xs].  [peel_end l E]:
    [E : map fst l = []], so [l] is [[]]. *)

Ltac peel l E v :=
  let k := fresh "k" in let Ek := fresh "Ek" in
  destruct l as [| [k v] l]; cbn [map fst] in E; [discriminate E |];
  injection E as Ek E; subst k.

Ltac peel_end l E :=
  destruct l; [clear E | discriminate E].

(** Simplify a goal about a concrete program and named fields, keeping the
    arithmetic for [lia]. *)
Ltac fold_simpl :=
  cbn -[Nat.add Nat.sub Nat.lt lt N.of_nat N.le N.lt Z.of_nat Z.add Z.sub
        Z.lt Z.le Z.gt Z.ge Z.eq max_safe] in *.

(** [clause_start]: from a [clause_keeps (holds p Q) sch c] goal, the
    hypotheses [Ha] (the payload bound), [S] (the fields), [H] (the
    invariant before), [W] (the flag conditions), [G] (the guard), and the
    invariant after as the goal.  The generated proof then peels the
    fields, splits on the flags, and runs [lia]. *)
Ltac clause_start :=
  apply clause_holds;
  let fl := fresh "fl" in let nu := fresh "nu" in let op := fresh "op" in
  let ls := fresh "ls" in
  intros [fl nu op ls] ?n Ha S H F;
  unfold fires in F; apply andb_true_iff in F as [F G]; apply andb_true_iff in F as [W C];
  clear C; apply geval_prop in G;
  destruct S as [Sf [Sn _]]; unfold arg_ok in Ha.

(** [restore_start]: from a [restores (holds p Q) p] goal, the initial
    case, then the stored case with [Ef], [En] (the saved fields) and [M]
    (the Schema bounds). *)
Ltac restore_start :=
  apply restores_holds;
  [| let sm := fresh "sm" in let F := fresh "F" in
     let sfl := fresh "sfl" in let snu := fresh "snu" in
     let sop := fresh "sop" in let sls := fresh "sls" in
     intros sm F; apply fits_spec in F as [Ef [En [_ [_ [M _]]]]];
     destruct sm as [sfl snu sop sls]; cbn [m_flags m_nums] in Ef, En;
     unfold model_fits in M; apply andb_true_iff in M as [_ M]; cbn [m_nums] in M].

(** [stored_start]: the stored case on its own, from a
    [forall sm, fits p sm = true -> Q (merge (p_init p) sm)] goal. *)
Ltac stored_start :=
  let sm := fresh "sm" in let F := fresh "F" in
  let sfl := fresh "sfl" in let snu := fresh "snu" in
  let sop := fresh "sop" in let sls := fresh "sls" in
  intros sm F; apply fits_spec in F as [Ef [En [_ [_ [M _]]]]];
  destruct sm as [sfl snu sop sls]; cbn [m_flags m_nums] in Ef, En;
  unfold model_fits in M; apply andb_true_iff in M as [_ M]; cbn [m_nums] in M.

(** The Schema bounds in [M], after the saved numbers are peeled, as
    [(N.of_nat v <= max)%N] facts. *)
Ltac bounds M :=
  fold_simpl; rewrite ?andb_true_iff, ?N.leb_le in M.

(** For the content mapper (fold/mapper): print a goal [lia] could not
    close, with its hypotheses, newest last, as [FOLD-HYP] and [FOLD-GOAL]
    lines.  It never closes the goal; the generated file then ends the
    proof with [Admitted], and the strict build (dune) never uses it. *)
Ltac fold_report :=
  idtac "FOLD-FAIL";
  try (match goal with
       | H : ?t |- _ => lazymatch type of t with
                        | Prop => idtac "FOLD-HYP" H ":" t; fail
                        | _ => fail
                        end
       end);
  match goal with |- ?g => idtac "FOLD-GOAL" g end.
