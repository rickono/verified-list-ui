(** * The counter as an XState machine with context, and its correctness.

    [counter] is written by hand in the expression language of XStateCtx.v.
    Its two control states are [unlocked] and [locked]; [count] and
    [changes] live in the context.  The context also carries [limit], which
    no transition assigns, so the UI can show the cap without restating it.
    [enc] maps an app state to the snapshot that represents it.

    The proofs are symbolic: they hold for every count, every [changes]
    value, and every payload, not for a sampled set.

    - [step_correct]: one machine step is one [update].
    - [can_correct]: [snapshot.can] is [enabled].
    - [machine_count_below_limit]: for every list of raw events, with any
      type string and any [nat] payload, the machine's [count] stays below
      500.
    - [js_count_below_limit]: the same for every JavaScript event, with any
      payload value (negative, fractional, a string, ...).  The event
      schemas reject the bad ones.
    - [js_exact]: on any run of fewer than 2^53 - 1 events, every number the
      machine computes is a safe integer, so JavaScript arithmetic agrees
      with [nat]. *)

From Stdlib Require Import String List Arith Bool NArith Lia.
From VerifiedListUI Require Import XState XStateCtx Counter.
Import ListNotations.
Open Scope list_scope.
Open Scope string_scope.

(** The largest [n] that the [ADD] and [SUB] schemas allow: 15 digits, as in
    the UI's amount field.  [payload_max_safe] shows that [count + n] is
    still a safe integer. *)
Definition payload_max : N := 999999999999999.

Definition counter : cmachine :=
  mkCMachine "counter" "unlocked" [("count", 0); ("changes", 0); ("limit", limit)]
    [("ADD", PNat payload_max); ("SUB", PNat payload_max);
     ("RESET", PNone); ("LOCK", PNone); ("UNLOCK", PNone)]
    [("unlocked", mkCNode
        [("ADD", [mkTrans (GLt (EAdd (EVar "count") EArg) (EVar "limit")) "unlocked"
                   [("count", EAdd (EVar "count") EArg);
                    ("changes", EAdd (EVar "changes") (ENum 1))]]);
         ("SUB", [mkTrans (GLe EArg (EVar "count")) "unlocked"
                   [("count", ESub (EVar "count") EArg);
                    ("changes", EAdd (EVar "changes") (ENum 1))]]);
         ("RESET", [mkTrans GTrue "unlocked" [("count", ENum 0); ("changes", ENum 0)]]);
         ("LOCK", [mkTrans GTrue "locked" []])]
        [("locked", false)]);
     ("locked", mkCNode
        [("UNLOCK", [mkTrans GTrue "unlocked" []])]
        [("locked", true)])]%string.

Definition ev (e : event) : cevent :=
  match e with
  | Add n => ("ADD", n)
  | Sub n => ("SUB", n)
  | Reset => ("RESET", 0)
  | Lock => ("LOCK", 0)
  | Unlock => ("UNLOCK", 0)
  end%string.

Definition enc (s : state) : snapshot :=
  (if locked s then "locked" else "unlocked",
   [("count", count s); ("changes", changes s); ("limit", limit)])%string.

Lemma counter_wf : cwfb counter = true.
Proof. vm_compute. reflexivity. Qed.

Lemma init_correct : c_init counter = enc initial.
Proof. reflexivity. Qed.

Theorem step_correct s e : c_step counter (enc s) (ev e) = enc (update s e).
Proof.
  destruct s as [[] c k]; destruct e; unfold update, enabled; lazy -[limit Nat.ltb Nat.leb Nat.add Nat.sub];
    try reflexivity.
  - destruct (Nat.ltb (c + n) limit); reflexivity.
  - destruct (Nat.leb n c); reflexivity.
Qed.

Theorem can_correct s e : c_can counter (enc s) (ev e) = enabled s e.
Proof.
  destruct s as [[] c k]; destruct e; lazy -[limit Nat.ltb Nat.leb Nat.add Nat.sub]; try reflexivity.
  - destruct (Nat.ltb (c + n) limit); reflexivity.
  - destruct (Nat.leb n c); reflexivity.
Qed.

Theorem meta_correct s : c_meta_of counter (enc s) = Some [("locked", locked s)]%string.
Proof. destruct s as [[] c k]; reflexivity. Qed.

Theorem run_correct es :
  c_run counter (c_init counter) (map ev es) = enc (run initial es).
Proof.
  rewrite init_correct. unfold c_run, run.
  generalize initial. induction es as [| e es IH]; intros s; simpl; auto.
  rewrite step_correct. apply IH.
Qed.

(** ** Raw events

    XState accepts any event object.  An event type the machine has no
    entry for is ignored, and the payload of [RESET], [LOCK], and [UNLOCK]
    is never read.  So every raw event acts as some app event or as
    nothing. *)

Definition event_types : list string := ["ADD"; "SUB"; "RESET"; "LOCK"; "UNLOCK"]%string.

Lemma lookup_notin {A} k (l : list (string * A)) :
  ~ In k (map fst l) -> lookup k l = None.
Proof.
  induction l as [| [k' v] l IH]; simpl; intros H; auto.
  destruct (String.eqb_spec k k') as [-> | _]; [tauto | auto].
Qed.

Lemma unknown_ignored s ty n :
  ~ In ty event_types -> c_step counter (enc s) (ty, n) = enc s.
Proof.
  intros H. unfold event_types in H.
  destruct s as [[] c k]; unfold c_step, candidates; cbn [fst snd enc locked];
  match goal with
  | |- context [lookup ?key (cm_states counter)] =>
      let v := eval vm_compute in (lookup key (cm_states counter)) in
      change (lookup key (cm_states counter)) with v
  end; cbv beta iota;
  (rewrite lookup_notin; [reflexivity | simpl in *; tauto]).
Qed.

Lemma raw_event s ty n :
  c_step counter (enc s) (ty, n) = enc s \/
  exists e, c_step counter (enc s) (ty, n) = enc (update s e).
Proof.
  destruct (String.eqb_spec ty "ADD") as [-> |]; [right; exists (Add n); apply (step_correct s (Add n)) |].
  destruct (String.eqb_spec ty "SUB") as [-> |]; [right; exists (Sub n); apply (step_correct s (Sub n)) |].
  destruct (String.eqb_spec ty "RESET") as [-> |];
    [right; exists Reset; rewrite <- step_correct; destruct s as [[] c k]; reflexivity |].
  destruct (String.eqb_spec ty "LOCK") as [-> |];
    [right; exists Lock; rewrite <- step_correct; destruct s as [[] c k]; reflexivity |].
  destruct (String.eqb_spec ty "UNLOCK") as [-> |];
    [right; exists Unlock; rewrite <- step_correct; destruct s as [[] c k]; reflexivity |].
  left. apply unknown_ignored. unfold event_types. simpl. intuition.
Qed.

(** The cap, stated on the machine itself: whatever events XState is sent,
    every snapshot it reaches encodes a state whose count is below 500. *)
Theorem machine_count_below_limit (evs : list cevent) :
  exists s, c_run counter (c_init counter) evs = enc s /\ count s < limit.
Proof.
  rewrite init_correct. unfold c_run.
  assert (H : forall s, Inv s -> exists s', fold_left (c_step counter) evs (enc s) = enc s' /\ Inv s').
  { induction evs as [| [ty n] evs IH]; simpl; intros s Hs.
    - exists s. auto.
    - destruct (raw_event s ty n) as [-> | [e ->]].
      + apply IH, Hs.
      + apply IH, update_inv, Hs. }
  apply H, initial_inv.
Qed.

(** The context, as XState holds it: [count] is below [limit], and the
    [limit] field the UI displays is the [limit] of the specification. *)
Corollary machine_context_ok (evs : list cevent) :
  exists c k, snd (c_run counter (c_init counter) evs) = [("count", c); ("changes", k); ("limit", limit)]
              /\ c < limit.
Proof.
  destruct (machine_count_below_limit evs) as [s [-> H]].
  exists (count s), (changes s). auto.
Qed.

(** ** Events from JavaScript

    [jev e] is the JavaScript event that the UI and the oracle send for [e]:
    [ADD] and [SUB] carry [n], and the other events have no [n]. *)

Definition jev (e : event) : jevent :=
  match e with
  | Add n | Sub n => (fst (ev e), PayNat n)
  | _ => (fst (ev e), PayOther)
  end.

Definition amount (e : event) : nat :=
  match e with Add n | Sub n => n | _ => 0 end.

Lemma event_types_declared : map fst (cm_events counter) = event_types.
Proof. reflexivity. Qed.

(** Events with an amount of at most [payload_max] pass the schema, so the
    machine does what [update] says. *)
Theorem js_step_correct s e :
  (N.of_nat (amount e) <= payload_max)%N ->
  js_step counter (enc s) (jev e) = enc (update s e).
Proof.
  intros H. unfold js_step.
  replace (admits counter (fst (jev e)) (snd (jev e))) with true.
  - rewrite <- step_correct. destruct e; reflexivity.
  - destruct e; simpl in H |- *; try reflexivity;
      symmetry; apply N.leb_le; exact H.
Qed.

Lemma js_raw_event s ev :
  js_step counter (enc s) ev = enc s \/
  exists e, js_step counter (enc s) ev = enc (update s e).
Proof.
  destruct ev as [ty p]. unfold js_step. simpl.
  destruct (admits counter ty p); [apply raw_event | left; reflexivity].
Qed.

(** The cap, for every list of JavaScript events. *)
Theorem js_count_below_limit (evs : list jevent) :
  exists s, js_run counter (c_init counter) evs = enc s /\ count s < limit.
Proof.
  rewrite init_correct. unfold js_run.
  assert (H : forall s, Inv s -> exists s', fold_left (js_step counter) evs (enc s) = enc s' /\ Inv s').
  { induction evs as [| ev evs IH]; simpl; intros s Hs.
    - exists s. auto.
    - destruct (js_raw_event s ev) as [-> | [e ->]].
      + apply IH, Hs.
      + apply IH, update_inv, Hs. }
  apply H, initial_inv.
Qed.

(** ** Exact arithmetic *)

Lemma payload_max_safe : (payload_max + N.of_nat limit <= max_safe)%N.
Proof. vm_compute. discriminate. Qed.

Lemma lookup_in {A} k (l : list (string * A)) v : lookup k l = Some v -> In (k, v) l.
Proof.
  induction l as [| [k' v'] l IH]; simpl; [discriminate |].
  destruct (String.eqb_spec k k') as [-> |]; [injection 1 as ->; auto | auto].
Qed.

(** One step that passes the schema computes only safe integers, if
    [changes] is below [max_safe].  [count] is below 500 and [n] is at most
    [payload_max], so [count + n] is safe. *)
Theorem step_exact s ty p :
  Inv s -> (N.of_nat (changes s) < max_safe)%N -> admits counter ty p = true ->
  exact counter (enc s) (ty, pay_arg p).
Proof.
  unfold Inv. intros Hc Hk Ha.
  pose proof payload_max_safe as Hmax.
  unfold admits in Ha.
  destruct (lookup ty (cm_events counter)) as [ps |] eqn:E; [| discriminate].
  apply lookup_in in E. simpl in E.
  destruct E as [E | [E | [E | [E | [E | []]]]]]; injection E as <- <-;
    [destruct p as [n |]; [apply N.leb_le in Ha | discriminate] ..
    | | |];
    destruct s as [[] c k]; simpl in Hc, Hk |- *;
    unfold exact; lazy -[limit Nat.add Nat.sub N.of_nat N.le N.add max_safe payload_max];
    intros v Hv; repeat destruct Hv as [<- | Hv]; try contradiction; lia.
Qed.

(** Every run of fewer than [max_safe] JavaScript events computes only
    safe integers.  ([changes] grows by at most one per event, and it is
    the only number without a fixed bound.) *)
Theorem js_exact (evs : list jevent) :
  (N.of_nat (length evs) < max_safe)%N -> trace_exact counter (c_init counter) evs.
Proof.
  intros Hlen. rewrite init_correct.
  assert (H : forall s, Inv s -> (N.of_nat (changes s + length evs) < max_safe)%N ->
                        trace_exact counter (enc s) evs).
  { clear Hlen. induction evs as [| ev evs IH]; simpl; intros s Hs Hk; auto. split.
    - intros Ha. apply step_exact; [exact Hs | lia | exact Ha].
    - destruct (js_raw_event s ev) as [-> | [e ->]].
      + apply IH; [exact Hs | lia].
      + pose proof (update_changes s e). apply IH; [apply update_inv, Hs | lia]. }
  apply H; [apply initial_inv | exact Hlen].
Qed.
