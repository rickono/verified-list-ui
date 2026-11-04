(** * State and operation proofs for the list UI. *)

From Stdlib Require Import String List Arith Bool Lia.
From VerifiedListUI Require Import ListUI.
Import ListNotations.
Open Scope list_scope.

(** ** Helper facts about [mem] and [remove_id]. *)

Lemma mem_true_iff : forall id l,
  mem id l = true <-> In id (map item_id l).
Proof.
  intros id l. unfold mem. rewrite existsb_exists, in_map_iff.
  split.
  - intros [it [Hin Heq]]. apply Nat.eqb_eq in Heq. eauto.
  - intros [it [Heq Hin]]. exists it. split; [assumption |].
    apply Nat.eqb_eq. assumption.
Qed.

Lemma mem_false_iff : forall id l,
  mem id l = false <-> ~ In id (map item_id l).
Proof.
  intros id l. rewrite <- mem_true_iff. destruct (mem id l); intuition congruence.
Qed.

(** Filtering never introduces an ID, so it cannot introduce a duplicate. *)
Lemma NoDup_map_filter : forall (f : item -> bool) l,
  NoDup (map item_id l) -> NoDup (map item_id (filter f l)).
Proof.
  intros f l. induction l as [| a l IH]; simpl; intros Hnd.
  - constructor.
  - inversion Hnd as [| ? ? Hnotin Hnd']; subst.
    destruct (f a); simpl; auto.
    constructor; auto.
    intros Hin. apply Hnotin.
    rewrite in_map_iff in Hin |- *. destruct Hin as [x [Hx Hinx]].
    apply filter_In in Hinx. exists x. tauto.
Qed.

(** Removing an ID that does not occur is the identity. *)
Lemma remove_id_absent : forall id l,
  ~ In id (map item_id l) -> remove_id id l = l.
Proof.
  intros id l. induction l as [| a l IH]; simpl; intros Hnot.
  - reflexivity.
  - unfold remove_id in *. simpl.
    destruct (Nat.eqb (item_id a) id) eqn:E.
    + apply Nat.eqb_eq in E. exfalso. apply Hnot. auto.
    + simpl. f_equal. apply IH. auto.
Qed.

Lemma remove_id_app : forall id l1 l2,
  remove_id id (l1 ++ l2) = remove_id id l1 ++ remove_id id l2.
Proof. intros. unfold remove_id. apply filter_app. Qed.

(** A unique ID splits the item list around exactly one record. *)
Lemma unique_id_split : forall id l,
  NoDup (map item_id l) ->
  In id (map item_id l) ->
  exists pre it post,
    l = pre ++ it :: post /\
    item_id it = id /\
    ~ In id (map item_id pre) /\
    ~ In id (map item_id post).
Proof.
  intros id l Hnd Hin.
  apply in_map_iff in Hin. destruct Hin as [it [Hid Hinit]].
  apply in_split in Hinit. destruct Hinit as [pre [post Hl]].
  exists pre, it, post. subst l.
  rewrite map_app in Hnd. simpl in Hnd.
  apply NoDup_remove_2 in Hnd. rewrite Hid, <- map_app in Hnd.
  repeat split; auto; intros H; apply Hnd; rewrite map_app; apply in_or_app; auto.
Qed.

(** The selected item of a valid state, with its position. *)
Lemma valid_selected_split : forall s id,
  Valid s ->
  selected s = Some id ->
  exists pre it post,
    items s = pre ++ it :: post /\
    item_id it = id /\
    ~ In id (map item_id pre) /\
    ~ In id (map item_id post).
Proof.
  intros s id [Hnd Hsel] Hs. rewrite Hs in Hsel.
  apply unique_id_split; assumption.
Qed.

(** ** Required state proofs. *)

Theorem initial_valid : Valid initial.
Proof.
  split; simpl.
  - repeat constructor; simpl; intuition discriminate.
  - exact I.
Qed.

Theorem update_preserves_validity : forall s e,
  Valid s -> Valid (update s e).
Proof.
  intros s e Hv. destruct e as [id | |]; simpl.
  - destruct (mem id (items s)) eqn:Hmem; [| exact Hv].
    destruct Hv as [Hnd _]. split; [exact Hnd |].
    simpl. apply mem_true_iff. exact Hmem.
  - destruct (selected s) as [id |] eqn:Hs; [| exact Hv].
    destruct Hv as [Hnd _]. split; simpl.
    + apply NoDup_map_filter. exact Hnd.
    + exact I.
  - exact initial_valid.
Qed.

Lemma run_preserves_validity_from : forall es s,
  Valid s -> Valid (run s es).
Proof.
  induction es as [| e es IH]; simpl; intros s Hv.
  - exact Hv.
  - apply IH. apply update_preserves_validity. exact Hv.
Qed.

Theorem run_preserves_validity : forall es,
  Valid (run initial es).
Proof.
  intros es. apply run_preserves_validity_from. exact initial_valid.
Qed.

Lemma run_app : forall s es1 es2,
  run s (es1 ++ es2) = run (run s es1) es2.
Proof. intros. unfold run. apply fold_left_app. Qed.

(** Every prefix of every finite event list reaches a valid state. *)
Theorem intermediate_states_valid : forall es n,
  Valid (run initial (firstn n es)).
Proof. intros. apply run_preserves_validity. Qed.

(** The same fact, phrased over all states the host passes through. *)
Fixpoint trace (s : state) (es : list event) : list state :=
  match es with
  | [] => [s]
  | e :: es' => s :: trace (update s e) es'
  end.

Lemma trace_prefixes : forall es s n,
  n <= length es ->
  nth_error (trace s es) n = Some (run s (firstn n es)).
Proof.
  induction es as [| e es IH]; intros s n Hn; destruct n as [| n]; simpl in *;
    try reflexivity.
  - inversion Hn.
  - apply IH. apply le_S_n. exact Hn.
Qed.

Theorem trace_valid : forall es,
  Forall Valid (trace initial es).
Proof.
  intros es. generalize initial initial_valid.
  induction es as [| e es IH]; intros s Hv; simpl; constructor; auto.
  apply IH. apply update_preserves_validity. exact Hv.
Qed.

(** ** Required operation proofs. *)

Theorem select_existing_spec : forall s id,
  In id (ids s) ->
  update s (Select id) = mkState (items s) (Some id).
Proof.
  intros s id Hin. simpl. apply mem_true_iff in Hin. rewrite Hin. reflexivity.
Qed.

Theorem select_missing_noop : forall s id,
  ~ In id (ids s) ->
  update s (Select id) = s.
Proof.
  intros s id Hnot. simpl. apply mem_false_iff in Hnot. rewrite Hnot. reflexivity.
Qed.

Theorem delete_none_noop : forall s,
  selected s = None ->
  update s DeleteSelected = s.
Proof. intros s Hs. simpl. rewrite Hs. reflexivity. Qed.

(** Deletion removes exactly one record, the one with the selected ID, keeps
    every other record unchanged and in order, and clears the selection.
    Because [pre ++ post] are the surviving records themselves (not just their
    IDs), this rules out wrong-item deletion, multiple deletion, relabelling,
    and reordering. *)
Theorem delete_selected_spec : forall s id,
  Valid s ->
  selected s = Some id ->
  exists pre it post,
    items s = pre ++ it :: post /\
    item_id it = id /\
    ~ In id (map item_id pre) /\
    ~ In id (map item_id post) /\
    update s DeleteSelected = mkState (pre ++ post) None.
Proof.
  intros s id Hv Hs.
  destruct (valid_selected_split s id Hv Hs) as [pre [it [post [Hl [Hid [Hpre Hpost]]]]]].
  exists pre, it, post. repeat split; auto.
  simpl. rewrite Hs, Hl, remove_id_app. simpl.
  rewrite Hid, Nat.eqb_refl. simpl.
  rewrite (remove_id_absent id pre Hpre), (remove_id_absent id post Hpost).
  reflexivity.
Qed.

Corollary delete_selected_length : forall s id,
  Valid s ->
  selected s = Some id ->
  length (items (update s DeleteSelected)) = length (items s) - 1.
Proof.
  intros s id Hv Hs.
  destruct (delete_selected_spec s id Hv Hs) as [pre [it [post [Hl [_ [_ [_ Hu]]]]]]].
  rewrite Hu, Hl. simpl. rewrite !length_app. simpl. lia.
Qed.

Corollary delete_selected_removes_id : forall s id,
  Valid s ->
  selected s = Some id ->
  ~ In id (ids (update s DeleteSelected)).
Proof.
  intros s id Hv Hs.
  destruct (delete_selected_spec s id Hv Hs) as [pre [it [post [_ [_ [Hpre [Hpost Hu]]]]]]].
  unfold ids. rewrite Hu. simpl. rewrite map_app. intros H.
  apply in_app_or in H. tauto.
Qed.

Theorem reset_spec : forall s,
  update s Reset = initial.
Proof. reflexivity. Qed.

(** A second deletion right after a deletion is a no-op. *)
Corollary delete_twice_noop : forall s,
  update (update s DeleteSelected) DeleteSelected = update s DeleteSelected.
Proof.
  intros s. simpl. destruct (selected s) eqn:Hs; simpl.
  - reflexivity.
  - rewrite Hs. reflexivity.
Qed.

Corollary reset_idempotent : forall s,
  update (update s Reset) Reset = update s Reset.
Proof. reflexivity. Qed.
