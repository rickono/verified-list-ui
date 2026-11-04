(** * The list UI as a Foldkit program, and its correctness.

    [list_program] is the list UI of ListUI.v written by hand in the
    language of Fold.v.  Its model has one optional number, [selected],
    and one list, [items], of [{ id, label }] records.  Ids are at most
    [max_id], the Schema maximum of [selected], of every id in [items], and
    of the [n] of [ClickedItem].

    Both fields are saved, under the key [list], by every message that
    fires.  At start-up the app restores what the store holds if it
    decodes, fits the [Model] Schema (ids within [max_id] and unique,
    labels printable ASCII other than the double quote and the backslash),
    and its selection, if any, is one of its ids: the reference
    [("selected", "items")].  Otherwise it starts from the three starting
    items.

    [enc s] is the model for ListUI state [s]; [msg e] is the message the
    UI sends for event [e]: [ClickedItem({ n: id })], [ClickedDelete()],
    [ClickedReset()].

    The proofs are symbolic, for every state, payload, and stored value:

    - [update_correct], [can_correct]: on the message for an event,
      [update] is ListUI's [update], and [can] says whether the event
      changes anything ([enabled]; for [DeleteSelected] it is View.v's
      [delete_enabled]).  The one command, when the event is enabled,
      saves the new state.  This needs the state's ids to fit the Schema
      ([ids_fit]), which every reachable state does;
    - [raw_message]: any message from JavaScript, with any tag and any
      payload, either changes nothing or acts as some ListUI event and
      saves the new state;
    - [restore_valid], [save_restore]: whatever the store holds, the app
      starts from a [Valid] state (unique ids, and the selection is one of
      them) whose ids and labels fit the Schema; and such a state, saved,
      restores to itself.  With nothing stored, it starts from [initial];
    - [fold_run]: on event messages, the app's model is [enc] of ListUI's
      [run] from the state it restored;
    - [fold_valid]: for every stored value and every list of messages,
      with any tags and any payloads, the model is [enc] of a [Valid]
      state.  This is [fold_keeps] (Fold.v): one obligation per clause,
      each that the clause is a ListUI event, and one for [restore];
    - [fold_saves_restore]: every save issued along the way holds such a
      state, and restores to exactly what it saved;
    - [fold_model_fits], [fold_exact]: the model always satisfies its
      Schema, and every number the printed [update] computes is a safe
      integer. *)

From Stdlib Require Import String List Arith Bool NArith Lia.
From VerifiedListUI Require Import XState XStateCtx Json Fold.
From VerifiedListUI Require Import ListUI ListUIProofs View.
Import ListNotations.
Open Scope list_scope.
Open Scope string_scope.

Definition max_id : N := 1000%N.

Definition entry_of (it : item) : entry := (item_id it, item_label it).

Definition init_entries : list entry := map entry_of (items initial).

Definition select_clause : clause :=
  mkClause [] GTrue [CHas "items" EArg] [] [] [("selected", OSome EArg)] [] true.

Definition delete_clause : clause :=
  mkClause [] GTrue [CSet "selected"] [] [] [("selected", ONull)] [("items", LDrop "selected")] true.

Definition reset_clause : clause :=
  mkClause [] GTrue [] [] [] [("selected", ONull)] [("items", LLit init_entries)] true.

Definition list_program : program :=
  mkProgram
    (mkModel [] [] [("selected", None)] [("items", init_entries)])
    [("selected", max_id); ("items", max_id)]
    ["selected"; "items"] [("selected", "items")]
    "list" "SaveList" "CompletedSaveList" "FailedSaveList" []
    [("ClickedItem", PNat max_id); ("ClickedDelete", PNone); ("ClickedReset", PNone);
     ("CompletedSaveList", PNone); ("FailedSaveList", PNone)]
    [("ClickedItem", [select_clause]);
     ("ClickedDelete", [delete_clause]);
     ("ClickedReset", [reset_clause])].

Definition enc (s : state) : fmodel :=
  mkModel [] [] [("selected", selected s)] [("items", map entry_of (items s))].

Definition msg (e : event) : jevent :=
  match e with
  | Select id => ("ClickedItem", PayNat id)
  | DeleteSelected => ("ClickedDelete", PayOther)
  | Reset => ("ClickedReset", PayOther)
  end.

(** Every id fits the Schema. *)
Definition ids_fit (s : state) : Prop :=
  Forall (fun id => (N.of_nat id <= max_id)%N) (ids s).

(** Every label fits the Schema. *)
Definition labels_ok (s : state) : Prop :=
  Forall (fun it => all_chars safe_char (item_label it) = true) (items s).

(** Whether event [e] changes anything in state [s]. *)
Definition enabled (s : state) (e : event) : bool :=
  match e with
  | Select id => mem id (items s)
  | DeleteSelected => delete_enabled (view s)
  | Reset => true
  end.

Lemma list_wf : fwfb list_program = true.
Proof. vm_compute. reflexivity. Qed.

Lemma init_correct : p_init list_program = enc initial.
Proof. reflexivity. Qed.

(** Both fields are saved: a save is the whole model. *)
Lemma saved_enc s : saved list_program (enc s) = enc s.
Proof. reflexivity. Qed.

(** With nothing stored, the app starts from the initial state. *)
Lemma restore_none : restore list_program None = enc initial.
Proof. reflexivity. Qed.

(** ** ListUI facts *)

Lemma initial_ids_fit : ids_fit initial.
Proof. unfold ids_fit, max_id. cbn. repeat constructor; cbn; lia. Qed.

Lemma update_ids_fit s e : ids_fit s -> ids_fit (update s e).
Proof.
  unfold ids_fit, ids. intros H. destruct e as [id | |]; cbn [update].
  - destruct (mem id (items s)); exact H.
  - destruct (selected s) as [id |]; [| exact H]. cbn [items].
    rewrite Forall_forall in *. intros x Hx. apply H.
    unfold remove_id in Hx. apply in_map_iff in Hx as [it [<- Hit]].
    apply filter_In in Hit as [Hit _]. apply in_map, Hit.
  - apply initial_ids_fit.
Qed.

Lemma initial_labels_ok : labels_ok initial.
Proof. unfold labels_ok. cbn. repeat constructor. Qed.

Lemma update_labels_ok s e : labels_ok s -> labels_ok (update s e).
Proof.
  unfold labels_ok. intros H. destruct e as [id | |]; cbn [update].
  - destruct (mem id (items s)); exact H.
  - destruct (selected s) as [id |]; [| exact H]. cbn [items].
    unfold remove_id. rewrite Forall_forall in *. intros it Hit.
    apply filter_In in Hit as [Hit _]. apply H, Hit.
  - apply initial_labels_ok.
Qed.

Lemma disabled_noop s e : enabled s e = false -> update s e = s.
Proof.
  destruct e as [id | |]; cbn [enabled update].
  - intros ->. reflexivity.
  - destruct s as [its [id |]]; [discriminate | reflexivity].
  - discriminate.
Qed.

Lemma not_mem_big s id : ids_fit s -> (max_id < N.of_nat id)%N -> mem id (items s) = false.
Proof.
  intros H Hid. apply mem_false_iff. intros Hin.
  unfold ids_fit, ids in H. rewrite Forall_forall in H. specialize (H _ Hin). lia.
Qed.

(** ** Lists *)

Lemma has_id_enc v l : has_id v (map entry_of l) = mem v l.
Proof.
  unfold has_id, mem. induction l as [| it l IH]; cbn; [reflexivity |]. rewrite IH. reflexivity.
Qed.

Lemma drop_id_enc v l : drop_id v (map entry_of l) = map entry_of (remove_id v l).
Proof.
  unfold drop_id, remove_id. induction l as [| it l IH]; cbn; [reflexivity |].
  destruct (negb (Nat.eqb (item_id it) v)); cbn; rewrite IH; reflexivity.
Qed.

(** ** Each clause is a ListUI event *)

Lemma select_fires s arg : fires (enc s) arg select_clause = mem arg (items s).
Proof.
  unfold fires. cbn -[has_id]. rewrite has_id_enc. destruct (mem arg (items s)); reflexivity.
Qed.

Lemma select_event s arg :
  fires (enc s) arg select_clause = true ->
  apply_clause (enc s) arg select_clause = enc (update s (Select arg)).
Proof. rewrite select_fires. intros H. cbn [update]. rewrite H. reflexivity. Qed.

Lemma delete_fires s arg : fires (enc s) arg delete_clause = delete_enabled (view s).
Proof. destruct s as [its [id |]]; reflexivity. Qed.

Lemma delete_event s arg :
  fires (enc s) arg delete_clause = true ->
  apply_clause (enc s) arg delete_clause = enc (update s DeleteSelected).
Proof.
  rewrite delete_fires. destruct s as [its [id |]]; [intros _ | discriminate].
  transitivity (mkModel [] [] [("selected", None)] [("items", drop_id id (map entry_of its))]);
    [reflexivity |].
  rewrite drop_id_enc. reflexivity.
Qed.

Lemma reset_event s arg :
  fires (enc s) arg reset_clause = true /\
  apply_clause (enc s) arg reset_clause = enc (update s Reset).
Proof. split; reflexivity. Qed.

Lemma program_clauses tag cs c :
  In (tag, cs) (p_update list_program) -> In c cs ->
  c = select_clause \/ c = delete_clause \/ c = reset_clause.
Proof.
  intros E Hc. unfold list_program in E. cbn [p_update In] in E.
  destruct E as [E | [E | [E | []]]]; injection E as _ <-;
    destruct Hc as [<- | []]; auto.
Qed.

Lemma clauses_cases tag c :
  In c (clauses list_program tag) ->
  c = select_clause \/ c = delete_clause \/ c = reset_clause.
Proof.
  unfold clauses. destruct (lookup tag (p_update list_program)) as [cs |] eqn:E; [| contradiction].
  apply lookup_some_in in E. apply (program_clauses _ _ _ E).
Qed.

(** A clause that fires on [enc s] saves, and is a ListUI event. *)
Lemma clause_event s arg c :
  c = select_clause \/ c = delete_clause \/ c = reset_clause ->
  fires (enc s) arg c = true ->
  cl_save c = true /\ exists e, apply_clause (enc s) arg c = enc (update s e).
Proof.
  intros [-> | [-> | ->]] F; (split; [reflexivity |]).
  - exists (Select arg). apply select_event, F.
  - exists DeleteSelected. apply delete_event, F.
  - exists Reset. apply reset_event.
Qed.

(** ** Event messages *)

Lemma step_one tag m arg c :
  clauses list_program tag = [c] ->
  f_step list_program m tag arg =
  if fires m arg c
  then Some (apply_clause m arg c,
             if cl_save c then [saved list_program (apply_clause m arg c)] else [])
  else None.
Proof. unfold f_step. intros ->. cbn [pick_clause]. destruct (fires m arg c); reflexivity. Qed.

(** The result of an event that fires: the new state, and its save. *)
Definition saving (s : state) : fmodel * list cmd := (enc s, [enc s]).

Lemma fire_delete s :
  f_fire list_program (enc s) (msg DeleteSelected) =
  if delete_enabled (view s) then Some (saving (update s DeleteSelected)) else None.
Proof.
  unfold f_fire. cbn [msg fst snd pay_arg].
  change (f_admits list_program "ClickedDelete" PayOther) with true. cbn iota.
  rewrite (step_one "ClickedDelete" _ _ delete_clause eq_refl).
  destruct (fires (enc s) 0 delete_clause) eqn:F.
  - rewrite (delete_event s 0 F). rewrite delete_fires in F. rewrite F. reflexivity.
  - rewrite delete_fires in F. rewrite F. reflexivity.
Qed.

Lemma fire_correct s e :
  ids_fit s ->
  f_fire list_program (enc s) (msg e) =
  if enabled s e then Some (saving (update s e)) else None.
Proof.
  intros Hf. destruct e as [id | |]; [| apply fire_delete | reflexivity].
  unfold f_fire. cbn [msg fst snd pay_arg enabled].
  change (f_admits list_program "ClickedItem" (PayNat id)) with (N.leb (N.of_nat id) max_id).
  destruct (N.leb (N.of_nat id) max_id) eqn:A.
  - rewrite (step_one "ClickedItem" _ _ select_clause eq_refl).
    destruct (fires (enc s) id select_clause) eqn:F.
    + rewrite (select_event s id F). rewrite select_fires in F. rewrite F. reflexivity.
    + rewrite select_fires in F. rewrite F. reflexivity.
  - apply N.leb_gt in A. rewrite (not_mem_big s id Hf A). reflexivity.
Qed.

Theorem update_correct s e :
  ids_fit s ->
  f_update list_program (enc s) (msg e) =
  (enc (update s e), if enabled s e then [enc (update s e)] else []).
Proof.
  intros H. unfold f_update. rewrite (fire_correct s e H).
  destruct (enabled s e) eqn:E; [reflexivity |]. rewrite (disabled_noop s e E). reflexivity.
Qed.

Theorem can_correct s e : ids_fit s -> f_can list_program (enc s) (msg e) = enabled s e.
Proof. intros H. unfold f_can. rewrite (fire_correct s e H). destruct (enabled s e); reflexivity. Qed.

(** The Delete button is enabled exactly when View.v says, in every state. *)
Corollary can_delete s :
  f_can list_program (enc s) (msg DeleteSelected) = delete_enabled (view s).
Proof. unfold f_can. rewrite fire_delete. destruct (delete_enabled (view s)); reflexivity. Qed.

Theorem run_correct s es : ids_fit s -> f_run list_program (enc s) (map msg es) = enc (run s es).
Proof.
  unfold f_run, run. revert s. induction es as [| e es IH]; cbn [map fold_left]; intros s H;
    [reflexivity |].
  rewrite update_correct by exact H. apply IH, update_ids_fit, H.
Qed.

(** ** Raw messages

    The runtime passes [update] whatever message it is given.  Each one
    either changes nothing, with no command, or acts as some ListUI event
    and saves the new state.  This holds for every state, valid or not. *)

Theorem raw_message s m :
  f_update list_program (enc s) m = (enc s, []) \/
  exists e, f_update list_program (enc s) m = saving (update s e).
Proof.
  destruct (update_cases list_program (enc s) m) as [E | [c [arg [Hc [_ [F E]]]]]];
    [left; exact E | right].
  destruct (clause_event s arg c (clauses_cases _ _ Hc) F) as [Hs [e He]].
  exists e. rewrite E, Hs, He. reflexivity.
Qed.

(** ** Restoring

    A stored record that [fits] is [enc] of a state that is [Valid] and
    fits the Schema: [fits] checks the names, the Schema bounds, unique
    ids, safe labels, and that the selection is one of the ids. *)

Definition fits_state (s : state) : Prop := Valid s /\ ids_fit s /\ labels_ok s.

Definition item_of (it : entry) : item := mkItem (fst it) (snd it).

Lemma entry_item l : map entry_of (map item_of l) = l.
Proof. induction l as [| [id lb] l IH]; cbn; [reflexivity | rewrite IH; reflexivity]. Qed.

Lemma ids_item l : ids (mkState (map item_of l) None) = map fst l.
Proof. unfold ids. cbn [items]. rewrite map_map. reflexivity. Qed.

Lemma fits_enc sm :
  fits list_program sm = true ->
  exists s, merge (p_init list_program) sm = enc s /\ sm = enc s /\ fits_state s.
Proof.
  intros F. apply fits_spec in F as [H1 [H2 [H3 [H4 [H5 H6]]]]].
  destruct sm as [fl nu op ls]. cbn in H1, H2, H3, H4.
  destruct fl; [| discriminate]. destruct nu; [| discriminate].
  destruct op as [| [x o] [| ? ?]]; cbn in H3; try discriminate. injection H3 as ->.
  destruct ls as [| [y l] [| ? ?]]; cbn in H4; try discriminate. injection H4 as ->.
  exists (mkState (map item_of l) o).
  assert (E : enc (mkState (map item_of l) o) = mkModel [] [] [("selected", o)] [("items", l)]).
  { unfold enc. cbn [selected items]. rewrite entry_item. reflexivity. }
  rewrite E. split; [reflexivity | split; [reflexivity |]].
  unfold model_fits, list_fits in H5. cbn [m_opts m_lists m_nums forallb fst snd] in H5.
  rewrite !andb_true_r, !andb_true_iff in H5. destruct H5 as [Ho [[Hid Hlb] Hu]].
  unfold refs_ok in H6. cbn in H6. rewrite andb_true_r in H6.
  assert (Hids : ids (mkState (map item_of l) o) = map fst l)
    by (unfold ids; cbn [items]; rewrite map_map; reflexivity).
  split; [split | split].
  - rewrite Hids. apply ids_unique_nodup, Hu.
  - cbn [selected]. rewrite Hids. destruct o as [v |]; [| exact I].
    apply has_id_in. unfold entries in H6. exact H6.
  - unfold ids_fit. rewrite Hids. rewrite Forall_forall. intros v Hv.
    apply in_map_iff in Hv as [it [<- Hit]]. rewrite forallb_forall in Hid.
    specialize (Hid it Hit). unfold num_fits in Hid. cbn in Hid. apply N.leb_le, Hid.
  - unfold labels_ok. cbn [items]. rewrite Forall_forall. intros it Hit.
    apply in_map_iff in Hit as [[id lb] [<- Hin]]. unfold entries_ok in Hlb.
    rewrite forallb_forall in Hlb. exact (Hlb _ Hin).
Qed.

(** Whatever the store holds, the app starts from [enc] of a state that is
    [Valid] and fits the Schema. *)
Theorem restore_valid st : exists s, restore list_program st = enc s /\ fits_state s.
Proof.
  destruct st as [sm |]; unfold restore;
    [destruct (saves list_program && fits list_program sm) eqn:F |].
  1: apply andb_true_iff in F as [_ F]; destruct (fits_enc sm F) as [s [-> [_ Hs]]];
     exists s; split; [reflexivity | exact Hs].
  all: exists initial; split; [reflexivity |].
  all: split; [exact initial_valid | split; [exact initial_ids_fit | exact initial_labels_ok]].
Qed.

(** A state that is [Valid] and fits the Schema, saved, restores to
    itself. *)
Theorem save_restore s : fits_state s -> restore list_program (Some (enc s)) = enc s.
Proof.
  intros [[Hd Hsel] [Hf Hl]].
  destruct s as [its sel]. unfold ids_fit, labels_ok, ids in *. cbn [items selected] in *.
  rewrite Forall_forall in Hf, Hl.
  assert (Hm : model_fits list_program (enc (mkState its sel)) = true).
  { unfold model_fits, enc. cbn [m_opts m_lists m_nums forallb]. rewrite !andb_true_r.
    apply andb_true_iff. split.
    - unfold opt_fits. cbn [fst snd]. destruct sel as [v |]; [| reflexivity].
      unfold num_fits. cbn [fst snd lookup p_max list_program String.eqb Ascii.eqb Bool.eqb].
      apply N.leb_le, Hf, Hsel.
    - unfold list_fits. cbn [fst snd]. rewrite !andb_true_iff. split; [split |].
      + apply forallb_forall. intros [id lb] Hin. apply in_map_iff in Hin as [it [E Hit]].
        injection E as <- _. unfold num_fits.
        cbn [fst snd lookup p_max list_program String.eqb Ascii.eqb Bool.eqb].
        apply N.leb_le, Hf, in_map, Hit.
      + unfold entries_ok. apply forallb_forall. intros [id lb] Hin.
        apply in_map_iff in Hin as [it [E Hit]]. injection E as _ <-. apply Hl, Hit.
      + apply ids_unique_nodup. rewrite map_map. exact Hd. }
  assert (Hr : refs_ok list_program (enc (mkState its sel)) = true).
  { unfold refs_ok, opt, entries, enc. cbn -[has_id]. rewrite andb_true_r.
    destruct sel as [v |]; [| reflexivity]. apply has_id_in. rewrite map_map. exact Hsel. }
  unfold restore. replace (fits list_program (enc (mkState its sel))) with true; [reflexivity |].
  symmetry. unfold fits. cbv zeta. rewrite Hm, Hr. reflexivity.
Qed.

(** On event messages, the app's model is [enc] of ListUI's [run] from the
    state it restored, and from [initial] when nothing is stored. *)
Corollary fold_run st es :
  exists s, restore list_program st = enc s /\ fits_state s /\
            f_run list_program (restore list_program st) (map msg es) = enc (run s es).
Proof.
  destruct (restore_valid st) as [s [E Hs]]. exists s. split; [exact E | split; [exact Hs |]].
  rewrite E. apply run_correct, Hs.
Qed.

Corollary fold_run_empty es :
  f_run list_program (restore list_program None) (map msg es) = enc (run initial es).
Proof. rewrite restore_none. apply run_correct, initial_ids_fit. Qed.

(** ** Validity, for any messages *)

Definition good (m : fmodel) : Prop := exists s, m = enc s /\ fits_state s.

(** One obligation per clause: it is a ListUI event, and ListUI's [update]
    keeps [Valid] (ListUIProofs.v) and the ids within the Schema. *)
Lemma update_fits_state s e : fits_state s -> fits_state (update s e).
Proof.
  intros [Hv [Hf Hl]]. split; [apply update_preserves_validity, Hv |].
  split; [apply update_ids_fit, Hf | apply update_labels_ok, Hl].
Qed.

Lemma clause_good sch c :
  c = select_clause \/ c = delete_clause \/ c = reset_clause -> clause_keeps good sch c.
Proof.
  intros Hc m arg _ [s [-> Hs]] F.
  destruct (clause_event s arg c Hc F) as [_ [e ->]]. exists (update s e).
  split; [reflexivity | apply update_fits_state, Hs].
Qed.

Lemma keeps_good : keeps good list_program.
Proof. unfold keeps. split_keeps; apply clause_good; auto. Qed.

Lemma restores_good : restores good list_program.
Proof.
  split.
  - exists initial. split; [reflexivity |].
    split; [exact initial_valid | split; [exact initial_ids_fit | exact initial_labels_ok]].
  - intros sm F. destruct (fits_enc sm F) as [s [-> [_ Hs]]]. exists s. split; [reflexivity | exact Hs].
Qed.

(** For every value in the store and every list of messages, with any tags
    and any payloads, the model is a valid ListUI state: its ids are
    unique, and the selection, if any, is one of them. *)
Theorem fold_valid st msgs :
  exists s, f_run list_program (restore list_program st) msgs = enc s /\ fits_state s.
Proof. exact (fold_keeps good list_program st msgs keeps_good restores_good). Qed.

(** ** Saves *)

(** Every save issued along the way holds a valid state, and restores to
    exactly what it saved. *)
Theorem fold_saves_restore st msgs c :
  In c (f_cmds list_program (restore list_program st) msgs) ->
  exists s, c = enc s /\ fits_state s /\ restore list_program (Some c) = c.
Proof.
  intros Hc. destruct (fold_saves_keep good list_program st msgs c keeps_good restores_good Hc)
    as [m [[s [-> Hs]] ->]].
  exists s. rewrite saved_enc. split; [reflexivity | split; [exact Hs | apply save_restore, Hs]].
Qed.

(** ** The model's Schema, and exact arithmetic *)

Lemma enc_fits s : fits_state s -> model_fits list_program (enc s) = true.
Proof.
  intros Hs. pose proof (save_restore s Hs) as E. unfold restore in E.
  destruct (saves list_program && fits list_program (enc s)) eqn:F.
  - apply andb_true_iff in F as [_ F]. apply fits_spec in F as [_ [_ [_ [_ [F _]]]]]. exact F.
  - rewrite <- E. reflexivity.
Qed.

(** The model always satisfies the printed [Model] Schema. *)
Theorem fold_model_fits st msgs :
  model_fits list_program (f_run list_program (restore list_program st) msgs) = true.
Proof. destruct (fold_valid st msgs) as [s [-> Hs]]. apply enc_fits, Hs. Qed.

Lemma step_exact s tag pl :
  f_admits list_program tag pl = true -> f_exact list_program (enc s) tag (pay_arg pl).
Proof.
  intros A. unfold f_admits in A.
  destruct (lookup tag (p_messages list_program)) as [sch |] eqn:E; [| discriminate].
  apply lookup_some_in in E. cbn in E.
  destruct E as [E | [E | [E | [E | [E | []]]]]]; injection E as <- <-; unfold f_exact; intros v Hv;
    cbn in Hv; repeat destruct Hv as [<- | Hv]; try contradiction;
    (destruct pl as [x |]; [apply N.leb_le in A | discriminate];
     cbn [pay_arg]; unfold max_safe, max_id in *; lia).
Qed.

(** Every number the printed [update] computes is a safe integer: the
    only one is the [n] of [ClickedItem], which its Schema bounds. *)
Theorem fold_exact st msgs : f_trace_exact list_program (restore list_program st) msgs.
Proof.
  destruct (restore_valid st) as [s0 [-> _]]. generalize s0 as s.
  induction msgs as [| m msgs IH]; intros s; cbn [f_trace_exact]; [exact I |]. split.
  - apply step_exact.
  - destruct (raw_message s m) as [E | [e E]]; rewrite E; apply IH.
Qed.
