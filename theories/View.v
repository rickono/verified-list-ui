(** * Declarative view and its correspondence proofs.

    [view] computes every flag the renderer needs.  The browser host only
    copies these rows and flags into the DOM; it does not decide which row is
    selected or whether deletion is possible. *)

From Stdlib Require Import String List Arith Bool.
From VerifiedListUI Require Import ListUI ListUIProofs.
Import ListNotations.
Open Scope list_scope.

Record row := mkRow {
  row_id : nat;
  row_label : string;
  row_selected : bool
}.

Record view_t := mkView {
  rows : list row;
  delete_enabled : bool;
  show_empty_message : bool
}.

Definition is_selected (sel : option nat) (id : nat) : bool :=
  match sel with
  | Some x => Nat.eqb x id
  | None => false
  end.

Definition render_row (sel : option nat) (it : item) : row :=
  mkRow (item_id it) (item_label it) (is_selected sel (item_id it)).

Definition view (s : state) : view_t :=
  mkView
    (map (render_row (selected s)) (items s))
    (match selected s with Some _ => true | None => false end)
    (match items s with [] => true | _ :: _ => false end).

Definition row_item (r : row) : item := mkItem (row_id r) (row_label r).

Definition selected_rows (v : view_t) : list row := filter row_selected (rows v).

(** ** Helper facts. *)

Lemma is_selected_iff : forall sel id,
  is_selected sel id = true <-> sel = Some id.
Proof.
  intros [x |] id; simpl.
  - rewrite Nat.eqb_eq. split; congruence.
  - split; discriminate.
Qed.

Lemma no_selected_rows_absent : forall id l,
  ~ In id (map item_id l) ->
  filter row_selected (map (render_row (Some id)) l) = [].
Proof.
  intros id l. induction l as [| a l IH]; simpl; intros Hnot; [reflexivity |].
  destruct (Nat.eqb id (item_id a)) eqn:E.
  - apply Nat.eqb_eq in E. exfalso. apply Hnot. auto.
  - apply IH. auto.
Qed.

Lemma no_selected_rows_none : forall l,
  filter row_selected (map (render_row None) l) = [].
Proof. induction l; simpl; auto. Qed.

(** ** Required view proofs. *)

(** The rows are exactly the state's items, in order, with the same IDs and
    labels. *)
Theorem view_rows_match_items : forall s,
  map row_item (rows (view s)) = items s.
Proof.
  intros s. simpl. rewrite map_map.
  rewrite <- (map_id (items s)) at 2. apply map_ext.
  intros [id label]. reflexivity.
Qed.

Corollary view_rows_positionwise : forall s n,
  option_map row_item (nth_error (rows (view s)) n) = nth_error (items s) n.
Proof.
  intros s n. rewrite <- view_rows_match_items, nth_error_map. reflexivity.
Qed.

Corollary view_rows_length : forall s,
  length (rows (view s)) = length (items s).
Proof. intros s. simpl. apply length_map. Qed.

(** A row is marked selected iff its ID is the selected ID. *)
Theorem view_row_selected_iff : forall s r,
  In r (rows (view s)) ->
  (row_selected r = true <-> selected s = Some (row_id r)).
Proof.
  intros s r Hin. simpl in Hin. apply in_map_iff in Hin.
  destruct Hin as [it [Hr _]]. subst r. simpl. apply is_selected_iff.
Qed.

(** With a selection, exactly one row is marked selected, and it is the
    selected item's row. *)
Theorem view_exactly_one_selected : forall s id,
  Valid s ->
  selected s = Some id ->
  exists it,
    In it (items s) /\
    item_id it = id /\
    selected_rows (view s) = [render_row (Some id) it].
Proof.
  intros s id Hv Hs.
  destruct (valid_selected_split s id Hv Hs) as [pre [it [post [Hl [Hid [Hpre Hpost]]]]]].
  exists it. split; [rewrite Hl; apply in_or_app; simpl; auto |]. split; [exact Hid |].
  unfold selected_rows, view. simpl. rewrite Hs, Hl, map_app, filter_app. simpl.
  rewrite (no_selected_rows_absent id pre Hpre), (no_selected_rows_absent id post Hpost).
  subst id. unfold render_row. simpl. rewrite Nat.eqb_refl. reflexivity.
Qed.

Corollary view_selected_count_some : forall s id,
  Valid s ->
  selected s = Some id ->
  length (selected_rows (view s)) = 1.
Proof.
  intros s id Hv Hs.
  destruct (view_exactly_one_selected s id Hv Hs) as [it [_ [_ Heq]]].
  rewrite Heq. reflexivity.
Qed.

(** Without a selection, no row is marked selected. *)
Theorem view_none_selected : forall s,
  selected s = None ->
  selected_rows (view s) = [].
Proof.
  intros s Hs. unfold selected_rows, view. simpl. rewrite Hs.
  apply no_selected_rows_none.
Qed.

(** Delete is enabled iff a selection exists. *)
Theorem view_delete_enabled_iff : forall s,
  delete_enabled (view s) = true <-> exists id, selected s = Some id.
Proof.
  intros s. simpl. destruct (selected s) as [id |].
  - split; eauto.
  - split; [discriminate | intros [id H]; discriminate].
Qed.

(** In a valid state, an enabled Delete button really deletes a present item:
    the selected row is on screen and the transition removes exactly it. *)
Theorem view_delete_enabled_effective : forall s,
  Valid s ->
  delete_enabled (view s) = true ->
  exists pre it post,
    items s = pre ++ it :: post /\
    selected s = Some (item_id it) /\
    update s DeleteSelected = mkState (pre ++ post) None.
Proof.
  intros s Hv Hen. apply view_delete_enabled_iff in Hen. destruct Hen as [id Hs].
  destruct (delete_selected_spec s id Hv Hs) as [pre [it [post [Hl [Hid [_ [_ Hu]]]]]]].
  exists pre, it, post. subst id. auto.
Qed.

(** The optional empty-state message is shown iff the list is empty. *)
Theorem view_empty_message_iff : forall s,
  show_empty_message (view s) = true <-> items s = [].
Proof.
  intros s. simpl. destruct (items s); split; congruence.
Qed.
