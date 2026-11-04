(** * The counter as a Foldkit program, and its correctness.

    [counter_program] is written by hand in the language of Fold.v.  Its
    model has the counter's state ([locked], [count], [changes]) and the
    state of the amount field: [amount], the last valid amount typed, and
    [amountOk], whether the field holds a valid amount now.  The counter's
    fields are saved to the KeyValueStore after every change, and restored
    when the app starts.

    [enc s a ok] is the model for counter state [s], amount [a], and flag
    [ok]; [msg e] is the message the UI sends for event [e].

    The proofs are symbolic, for every state, payload, and stored value:

    - [update_correct], [can_correct]: [update] on a counter message is
      [Counter.update], and it saves exactly when the event is enabled;
      [can] is [enabled];
    - [raw_message]: any message from JavaScript, with any tag and any
      payload, either changes only the amount field, or is an enabled
      counter event, applied and saved;
    - [restore_enc]: whatever the store holds, the restored model encodes a
      state with count below 500;
    - [fold_below_cap]: for every stored value and every list of messages,
      the count stays below 500.  This is [fold_keeps] (Fold.v): one
      arithmetic fact per clause, each proved by [lia], and the Schema
      maximum for [restore].  [saves_below_cap]: so does every save;
    - [fold_amount_fits]: likewise, the amount stays within its Schema
      maximum;
    - [fold_count_below_limit]: the cap on counter states, since every run
      keeps the model's fields ([fold_fields], Fold.v);
    - [fold_saves], [saves_restore]: every save the app issues holds a
      state with count below 500, and restoring it gives back that state;
    - [fold_model_fits], [fold_exact]: on runs shorter than 2^53 - 1
      messages, the model always satisfies its Schema and every number the
      printed [update] computes is a safe integer. *)

From Stdlib Require Import String List Arith Bool NArith Lia.
From VerifiedListUI Require Import XState XStateCtx Fold.
From VerifiedListUI Require CounterMachine.
From VerifiedListUI Require Import Counter.
Import ListNotations.
Open Scope list_scope.
Open Scope string_scope.

Abbreviation payload_max := CounterMachine.payload_max.

Definition counter_program : program :=
  mkProgram
    (mkModel [("locked", false); ("amountOk", true)]
             [("count", 0); ("changes", 0); ("amount", 250)] [] [])
    [("count", N.of_nat (limit - 1)); ("changes", max_safe); ("amount", payload_max)]
    ["locked"; "count"; "changes"] []
    "counter" "SaveCounter" "CompletedSaveCounter" "FailedSaveCounter"
    [("limit", limit)]
    [("ClickedAdd", PNat payload_max); ("ClickedSubtract", PNat payload_max);
     ("ClickedReset", PNone); ("ClickedLock", PNone); ("ClickedUnlock", PNone);
     ("ChangedAmount", PNat payload_max); ("ClearedAmount", PNone);
     ("CompletedSaveCounter", PNone); ("FailedSaveCounter", PNone)]
    [("ClickedAdd",
      [mkClause [("locked", false)] (GLt (EAdd (EVar "count") EArg) (ENum limit)) [] []
         [("count", EAdd (EVar "count") EArg); ("changes", EAdd (EVar "changes") (ENum 1))] [] [] true]);
     ("ClickedSubtract",
      [mkClause [("locked", false)] (GLe EArg (EVar "count")) [] []
         [("count", ESub (EVar "count") EArg); ("changes", EAdd (EVar "changes") (ENum 1))] [] [] true]);
     ("ClickedReset",
      [mkClause [("locked", false)] GTrue [] [] [("count", ENum 0); ("changes", ENum 0)] [] [] true]);
     ("ClickedLock", [mkClause [("locked", false)] GTrue [] [("locked", true)] [] [] [] true]);
     ("ClickedUnlock", [mkClause [("locked", true)] GTrue [] [("locked", false)] [] [] [] true]);
     ("ChangedAmount", [mkClause [] GTrue [] [("amountOk", true)] [("amount", EArg)] [] [] false]);
     ("ClearedAmount", [mkClause [] GTrue [] [("amountOk", false)] [] [] [] false])].

Definition enc (s : state) (a : nat) (ok : bool) : fmodel :=
  mkModel [("locked", locked s); ("amountOk", ok)]
          [("count", count s); ("changes", changes s); ("amount", a)] [] [].

(** The record the save command stores for [s]. *)
Definition senc (s : state) : fmodel :=
  mkModel [("locked", locked s)] [("count", count s); ("changes", changes s)] [] [].

Definition msg (e : event) : jevent :=
  match e with
  | Add n => ("ClickedAdd", PayNat n)
  | Sub n => ("ClickedSubtract", PayNat n)
  | Reset => ("ClickedReset", PayOther)
  | Lock => ("ClickedLock", PayOther)
  | Unlock => ("ClickedUnlock", PayOther)
  end.

Definition amount (e : event) : nat :=
  match e with Add n | Sub n => n | _ => 0 end.

Lemma counter_wf : fwfb counter_program = true.
Proof. vm_compute. reflexivity. Qed.

Lemma init_correct : p_init counter_program = enc initial 250 true.
Proof. reflexivity. Qed.

Lemma saved_enc s a ok : saved counter_program (enc s a ok) = senc s.
Proof. reflexivity. Qed.

(** ** Counter messages *)

Lemma admits_msg e :
  (N.of_nat (amount e) <= payload_max)%N ->
  f_admits counter_program (fst (msg e)) (snd (msg e)) = true.
Proof. intros H. destruct e; try reflexivity; apply N.leb_le, H. Qed.

Theorem update_correct s a ok e :
  (N.of_nat (amount e) <= payload_max)%N ->
  f_update counter_program (enc s a ok) (msg e) =
  (enc (update s e) a ok, if enabled s e then [senc (update s e)] else []).
Proof.
  intros H. unfold f_update, f_fire. rewrite (admits_msg e H).
  destruct s as [[] c k]; destruct e; unfold update, enabled;
    lazy -[limit Nat.ltb Nat.leb Nat.add Nat.sub]; try reflexivity.
  - destruct (Nat.ltb (c + n) limit); reflexivity.
  - destruct (Nat.leb n c); reflexivity.
Qed.

Theorem can_correct s a ok e :
  (N.of_nat (amount e) <= payload_max)%N ->
  f_can counter_program (enc s a ok) (msg e) = enabled s e.
Proof.
  intros H. unfold f_can, f_fire. rewrite (admits_msg e H).
  destruct s as [[] c k]; destruct e; unfold enabled;
    lazy -[limit Nat.ltb Nat.leb Nat.add Nat.sub]; try reflexivity.
  - destruct (Nat.ltb (c + n) limit); reflexivity.
  - destruct (Nat.leb n c); reflexivity.
Qed.

Theorem run_correct s a ok es :
  Forall (fun e => (N.of_nat (amount e) <= payload_max)%N) es ->
  f_run counter_program (enc s a ok) (map msg es) = enc (run s es) a ok.
Proof.
  unfold f_run, run. revert s.
  induction es as [| e es IH]; simpl; intros s H; auto.
  inversion H as [| ? ? He Hes]; subst.
  rewrite update_correct by exact He. apply IH, Hes.
Qed.

(** ** Raw messages

    The runtime passes [update] whatever message it is given: results of
    commands, and anything else dispatched to it.  Each one either leaves
    the counter alone (the amount field may change, to a valid amount), or
    is an enabled counter event, applied and saved. *)

Definition outcome (s : state) (a : nat) (ok : bool) (m : jevent) : Prop :=
  (exists a' ok', (a' = a \/ (N.of_nat a' <= payload_max)%N) /\
     f_update counter_program (enc s a ok) m = (enc s a' ok', [])) \/
  (exists e, enabled s e = true /\
     f_update counter_program (enc s a ok) m = (enc (update s e) a ok, [senc (update s e)])).

Lemma via_event s a ok e m :
  (N.of_nat (amount e) <= payload_max)%N ->
  f_update counter_program (enc s a ok) m = f_update counter_program (enc s a ok) (msg e) ->
  outcome s a ok m.
Proof.
  intros H Hm. unfold outcome. rewrite Hm, update_correct by exact H.
  destruct (enabled s e) eqn:E.
  - right. exists e. auto.
  - left. exists a, ok. rewrite disabled_noop by exact E. auto.
Qed.

Lemma unchanged s a ok m :
  f_update counter_program (enc s a ok) m = (enc s a ok, []) -> outcome s a ok m.
Proof. intros H. left. exists a, ok. auto. Qed.

(** The payload of a [PNone] tag is not read. *)
Ltac same_result pl s :=
  destruct pl; destruct s as [[] ? ?]; lazy -[limit Nat.ltb Nat.leb Nat.add Nat.sub]; reflexivity.

Theorem raw_message s a ok m : outcome s a ok m.
Proof.
  destruct m as [tag pl].
  destruct (String.eqb_spec tag "ClickedAdd") as [-> | T0].
  { destruct pl as [x |]; [| apply unchanged, update_rejected; reflexivity].
    destruct (N.leb (N.of_nat x) payload_max) eqn:E.
    - apply (via_event s a ok (Add x)); [apply N.leb_le, E | reflexivity].
    - apply unchanged, update_rejected, E. }
  destruct (String.eqb_spec tag "ClickedSubtract") as [-> | T1].
  { destruct pl as [x |]; [| apply unchanged, update_rejected; reflexivity].
    destruct (N.leb (N.of_nat x) payload_max) eqn:E.
    - apply (via_event s a ok (Sub x)); [apply N.leb_le, E | reflexivity].
    - apply unchanged, update_rejected, E. }
  destruct (String.eqb_spec tag "ClickedReset") as [-> | T2].
  { apply (via_event s a ok Reset); [simpl; lia | same_result pl s]. }
  destruct (String.eqb_spec tag "ClickedLock") as [-> | T3].
  { apply (via_event s a ok Lock); [simpl; lia | same_result pl s]. }
  destruct (String.eqb_spec tag "ClickedUnlock") as [-> | T4].
  { apply (via_event s a ok Unlock); [simpl; lia | same_result pl s]. }
  destruct (String.eqb_spec tag "ChangedAmount") as [-> | T5].
  { destruct pl as [x |]; [| apply unchanged, update_rejected; reflexivity].
    destruct (N.leb (N.of_nat x) payload_max) eqn:E.
    - left. exists x, true. split; [right; apply N.leb_le, E |].
      unfold f_update, f_fire. cbn [fst snd].
      replace (f_admits counter_program "ChangedAmount" (PayNat x)) with true
        by (symmetry; exact E).
      reflexivity.
    - apply unchanged, update_rejected, E. }
  destruct (String.eqb_spec tag "ClearedAmount") as [-> | T6].
  { left. exists a, false. split; [left; reflexivity | same_result pl s]. }
  apply unchanged, update_no_clauses. unfold clauses.
  rewrite CounterMachine.lookup_notin; [reflexivity |]. cbn. intuition congruence.
Qed.

(** ** Restoring *)

(** Whatever the store holds, the app starts from a state below the cap,
    with the default amount. *)
Theorem restore_enc st :
  exists s, restore counter_program st = enc s 250 true /\ Inv s /\
            (N.of_nat (changes s) <= max_safe)%N.
Proof.
  destruct st as [[fl nu op ls] |]; unfold restore;
    [destruct (saves counter_program && fits counter_program (mkModel fl nu op ls)) eqn:F |].
  2, 3: exists initial; split; [reflexivity | split; [apply initial_inv | vm_compute; discriminate]].
  apply andb_true_iff in F as [_ F]. apply fits_spec in F.
  destruct F as [H1 [H2 [H3 [H4 [H5 _]]]]]. cbn in H1, H2, H3, H4.
  destruct fl as [| [x b] [| ? ?]]; cbn in H1; try discriminate. injection H1 as ->.
  destruct nu as [| [y c] [| [z k] [| ? ?]]]; cbn in H2; try discriminate. injection H2 as -> ->.
  destruct op; [| discriminate]. destruct ls; [| discriminate].
  unfold model_fits in H5. cbn in H5. rewrite !andb_true_iff, !N.leb_le in H5.
  exists (mkState b c k). split; [reflexivity |]. unfold Inv, limit; cbn [count changes].
  lia.
Qed.

(** ** The cap

    The cap is an invariant of the model, so [fold_keeps] (Fold.v) proves
    it from one fact per clause and one about [restore].  [keeps_nums]
    turns each clause into arithmetic on the old count, the guard, and the
    payload bound, in two goals: one with a [count] field, one without
    (where it reads as 0).  [lia] proves all 14.  For [restore], the
    [count] maximum in the Schema is 499. *)

Definition below_cap (m : fmodel) : Prop := num m "count" < limit.

Lemma keeps_below_cap : keeps below_cap counter_program.
Proof. keeps_nums below_cap. all: unfold limit in *; lia. Qed.

Lemma restores_below_cap : restores below_cap counter_program.
Proof.
  apply restores_fits; [reflexivity |]. intros m H.
  pose proof (num_le_max counter_program m "count" _ H eq_refl).
  unfold below_cap, limit in *. lia.
Qed.

(** For every value in the store and every list of messages, with any
    tags and any payloads, the count stays below 500. *)
Theorem fold_below_cap st msgs :
  below_cap (f_run counter_program (restore counter_program st) msgs).
Proof. apply fold_keeps; [exact keeps_below_cap | exact restores_below_cap]. Qed.

(** Every save the app issues holds a count below 500. *)
Corollary saves_below_cap st msgs c :
  In c (f_cmds counter_program (restore counter_program st) msgs) -> num c "count" < limit.
Proof.
  intros H.
  destruct (fold_saves_keep _ _ st msgs c keeps_below_cap restores_below_cap H) as [m [Hm ->]].
  rewrite num_saved by reflexivity. exact Hm.
Qed.

(** A second invariant, which needs the payload bound: the amount stays
    within its Schema maximum.  [ChangedAmount] sets it to [n], which its
    message Schema bounds. *)
Definition amount_fits (m : fmodel) : Prop := (N.of_nat (num m "amount") <= payload_max)%N.

Theorem fold_amount_fits st msgs :
  amount_fits (f_run counter_program (restore counter_program st) msgs).
Proof.
  apply fold_keeps.
  - keeps_nums amount_fits. all: lia.
  - apply restores_fits; [reflexivity |]. intros m H.
    exact (num_le_max counter_program m "amount" _ H eq_refl).
Qed.

(** A model with the counter's fields is [enc] of a counter state, and
    [fold_fields] (Fold.v) says every run keeps the fields. *)
Lemma fields_enc m :
  same_fields counter_program m ->
  m = enc (mkState (flag m "locked") (num m "count") (num m "changes"))
          (num m "amount") (flag m "amountOk").
Proof.
  destruct m as [fl nu op ls]. intros [H1 [H2 [H3 H4]]]. cbn in H1, H2, H3, H4.
  destruct op; [| discriminate]. destruct ls; [| discriminate].
  destruct fl as [| [x b] [| [y b'] [| ? ?]]]; cbn in H1; try discriminate.
  injection H1 as -> ->.
  destruct nu as [| [x c] [| [y k] [| [z a] [| ? ?]]]]; cbn in H2; try discriminate.
  injection H2 as -> -> ->. reflexivity.
Qed.

(** So the cap, stated on counter states. *)
Theorem fold_count_below_limit st msgs :
  exists s a ok, f_run counter_program (restore counter_program st) msgs = enc s a ok /\
                 count s < limit.
Proof.
  pose proof (fields_enc _ (fold_fields counter_program st msgs)) as E.
  eexists _, _, _. split; [exact E | exact (fold_below_cap st msgs)].
Qed.

(** ** Saves *)

(** Every save issued along a run stores a state below the cap, whose
    [changes] grew by at most one per message. *)
Theorem fold_saves msgs : forall s a ok c,
  Inv s -> In c (f_cmds counter_program (enc s a ok) msgs) ->
  exists s', c = senc s' /\ Inv s' /\ changes s' <= changes s + length msgs.
Proof.
  induction msgs as [| m msgs IH]; simpl; intros s a ok c Hs Hc; [contradiction |].
  destruct (raw_message s a ok m) as [[a' [ok' [_ E]]] | [e [_ E]]];
    rewrite E in Hc; simpl in Hc.
  - destruct (IH s a' ok' c Hs Hc) as [s' [-> [Hs' Hk]]]. exists s'. split; [| split]; auto. lia.
  - pose proof (update_changes s e) as Hu.
    destruct Hc as [<- | Hc].
    + exists (update s e). split; [| split]; auto using update_inv. lia.
    + destruct (IH (update s e) a ok c (update_inv s e Hs) Hc) as [s' [-> [Hs' Hk]]].
      exists s'. split; [| split]; auto. lia.
Qed.

(** A save of a state below the cap restores to that state. *)
Theorem save_restore s :
  Inv s -> (N.of_nat (changes s) <= max_safe)%N ->
  restore counter_program (Some (senc s)) = enc s 250 true.
Proof.
  unfold Inv. intros Hc Hk. destruct s as [l c k]. cbn in Hc, Hk.
  unfold restore.
  replace (fits counter_program (senc (mkState l c k))) with true; [reflexivity |].
  symmetry. unfold fits. cbn. rewrite !andb_true_iff, !N.leb_le.
  unfold limit, max_safe in *. lia.
Qed.

(** So, on a run of fewer than 2^53 - 1 messages, everything the app saves
    restores to what it saved. *)
Corollary saves_restore s a ok msgs c :
  Inv s -> (N.of_nat (changes s + length msgs) <= max_safe)%N ->
  In c (f_cmds counter_program (enc s a ok) msgs) ->
  exists s', c = senc s' /\ count s' < limit /\ restore counter_program (Some c) = enc s' 250 true.
Proof.
  intros Hs Hk Hc. destruct (fold_saves msgs s a ok c Hs Hc) as [s' [-> [Hs' Hk']]].
  exists s'. split; [reflexivity | split; [exact Hs' |]].
  apply save_restore; [exact Hs' | lia].
Qed.

(** ** The model's Schema, and exact arithmetic *)

Lemma payload_max_safe : (payload_max + N.of_nat limit <= max_safe)%N.
Proof. exact CounterMachine.payload_max_safe. Qed.

Definition good (s : state) (a : nat) : Prop :=
  Inv s /\ (N.of_nat a <= payload_max)%N.

Lemma good_step s a ok m :
  good s a -> exists s' a' ok', fst (f_update counter_program (enc s a ok) m) = enc s' a' ok' /\
                                good s' a' /\ changes s' <= changes s + 1.
Proof.
  intros [Hs Ha]. destruct (raw_message s a ok m) as [[a' [ok' [Ha' ->]]] | [e [_ ->]]]; simpl.
  - exists s, a', ok'. repeat split; auto; [| lia]. destruct Ha' as [-> | Ha']; auto.
  - exists (update s e), a, ok. repeat split; auto using update_inv, update_changes.
Qed.

Lemma enc_fits s a ok :
  good s a -> (N.of_nat (changes s) <= max_safe)%N ->
  model_fits counter_program (enc s a ok) = true.
Proof.
  intros [Hs Ha] Hk. pose proof payload_max_safe. unfold Inv in Hs.
  destruct s as [l c k]. cbn in Hs, Hk |- *.
  rewrite !andb_true_iff, !N.leb_le. unfold limit in *. lia.
Qed.

(** On every run of fewer than 2^53 - 1 messages from a good model, the
    model satisfies the printed [Model] Schema. *)
Theorem fold_model_fits msgs : forall s a ok,
  good s a -> (N.of_nat (changes s + length msgs) <= max_safe)%N ->
  model_fits counter_program (f_run counter_program (enc s a ok) msgs) = true.
Proof.
  unfold f_run. induction msgs as [| m msgs IH]; simpl; intros s a ok Hg Hk.
  - apply enc_fits; [exact Hg | lia].
  - destruct (good_step s a ok m Hg) as [s' [a' [ok' [-> [Hg' Hk']]]]].
    apply IH; [exact Hg' | lia].
Qed.

Lemma step_exact s a ok tag pl :
  good s a -> (N.of_nat (changes s) < max_safe)%N ->
  f_admits counter_program tag pl = true ->
  f_exact counter_program (enc s a ok) tag (pay_arg pl).
Proof.
  intros [Hc Ha] Hk Hadm. unfold Inv in Hc.
  pose proof payload_max_safe as Hmax.
  unfold f_admits in Hadm.
  destruct (lookup tag (p_messages counter_program)) as [ps |] eqn:E; [| discriminate].
  apply CounterMachine.lookup_in in E. cbn in E.
  destruct E as [E | [E | [E | [E | [E | [E | [E | [E | [E | []]]]]]]]]];
    injection E as <- <-;
    try (destruct pl as [x |]; [apply N.leb_le in Hadm | discriminate]);
    destruct s as [l c k]; cbn in Hc, Hk |- *;
    unfold f_exact; lazy -[limit Nat.add Nat.sub N.of_nat N.le N.add max_safe payload_max];
    intros v Hv; repeat destruct Hv as [<- | Hv]; try contradiction; lia.
Qed.

(** Every run of fewer than 2^53 - 1 messages from a good model computes
    only safe integers. *)
Theorem fold_exact msgs : forall s a ok,
  good s a -> (N.of_nat (changes s + length msgs) < max_safe)%N ->
  f_trace_exact counter_program (enc s a ok) msgs.
Proof.
  induction msgs as [| m msgs IH]; simpl; intros s a ok Hg Hk; auto. split.
  - intros Ha. apply step_exact; [exact Hg | lia | exact Ha].
  - destruct (good_step s a ok m Hg) as [s' [a' [ok' [-> [Hg' Hk']]]]].
    apply IH; [exact Hg' | lia].
Qed.

(** From the initial model, or from anything [restore] returns. *)
Corollary init_exact msgs :
  (N.of_nat (length msgs) < max_safe)%N ->
  f_trace_exact counter_program (p_init counter_program) msgs.
Proof.
  intros H. rewrite init_correct. apply fold_exact.
  - split; [apply initial_inv | vm_compute; discriminate].
  - exact H.
Qed.

Corollary restored_exact st msgs :
  exists s, restore counter_program st = enc s 250 true /\
            ((N.of_nat (changes s + length msgs) < max_safe)%N ->
             f_trace_exact counter_program (restore counter_program st) msgs).
Proof.
  destruct (restore_enc st) as [s [E [Hs _]]]. exists s. split; [exact E |].
  intros H. rewrite E. apply fold_exact; [split; [exact Hs | vm_compute; discriminate] | exact H].
Qed.
