(** * Compiling the list UI to a flat XState machine.

    [update] is defined for every state, but only finitely many states are
    reachable from [initial].  [reachable] enumerates them.  [compile] gives
    each one a state key, and gives it one transition per event whose
    update changes the state.  The view is stored in the state node's
    [meta].

    The main theorem, [compile_correct], says that for every finite event
    list, running the compiled machine on the event names ends in the state
    whose key encodes [run initial es], and whose meta is that state's
    view.  Events outside the compiled alphabet (for example [Select 999])
    are covered too: the machine ignores them, and [update] does as well. *)

From Stdlib Require Import String List Arith Bool Ascii.
From Stdlib Require DecimalString DecimalNat.
From VerifiedListUI Require Import ListUI ListUIProofs View XState.
Import ListNotations.
Open Scope list_scope.

(** ** Names *)

Definition digits (n : nat) : string :=
  DecimalString.NilEmpty.string_of_uint (Nat.to_uint n).

Definition ev_name (e : event) : string :=
  match e with
  | Select id => "SELECT_" ++ digits id
  | DeleteSelected => "DELETE_SELECTED"
  | Reset => "RESET"
  end%string.

Definition enc (s : state) : string :=
  ("items" ++
   fold_right (fun it acc => "_" ++ digits (item_id it) ++ acc) "" (items s) ++
   "__sel_" ++
   match selected s with None => "none" | Some id => digits id end)%string.

Lemma digits_inj a b : digits a = digits b -> a = b.
Proof.
  unfold digits. intros H.
  apply (f_equal DecimalString.NilEmpty.uint_of_string) in H.
  rewrite !DecimalString.NilEmpty.usu in H. injection H as H.
  now apply DecimalNat.Unsigned.to_uint_inj.
Qed.

Theorem ev_name_inj e1 e2 : ev_name e1 = ev_name e2 -> e1 = e2.
Proof.
  destruct e1, e2; simpl; intros H; try discriminate; try reflexivity.
  repeat (injection H as H). f_equal. now apply digits_inj.
Qed.

(** ** Decidable equality and reachable states *)

Definition state_eq_dec (s t : state) : {s = t} + {s <> t}.
Proof.
  decide equality;
    repeat (decide equality || apply string_dec || apply Nat.eq_dec).
Defined.

Definition state_eqb (s t : state) : bool :=
  if state_eq_dec s t then true else false.

Definition event_eq_dec (e f : event) : {e = f} + {e <> f}.
Proof. decide equality; apply Nat.eq_dec. Defined.

Definition memb (s : state) (l : list state) : bool :=
  existsb (state_eqb s) l.

Lemma memb_In s l : memb s l = true -> In s l.
Proof.
  unfold memb, state_eqb. intros H. apply existsb_exists in H.
  destruct H as [t [Hin Ht]]. destruct (state_eq_dec s t); congruence.
Qed.

(** The events that can change some reachable state. *)
Definition alphabet : list event :=
  map Select (ids initial) ++ [DeleteSelected; Reset].

Definition successors (s : state) : list state :=
  map (update s) alphabet.

(** Breadth-first exploration with fuel.  Nothing about it is proved:
    [reachable_closed] below checks its output directly. *)
Fixpoint explore (fuel : nat) (seen frontier : list state) : list state :=
  match fuel with
  | O => seen
  | S fuel' =>
      let fresh :=
        fold_left (fun acc t => if memb t (seen ++ acc) then acc else acc ++ [t])
          (flat_map successors frontier) [] in
      match fresh with
      | [] => seen
      | _ => explore fuel' (seen ++ fresh) fresh
      end
  end.

(** Computed once, so later proofs see a literal list of states. *)
Definition reachable : list state :=
  Eval vm_compute in explore 64 [initial] [initial].

(** ** The compiled machine *)

Definition transitions (s : state) : list (string * string) :=
  map (fun e => (ev_name e, enc (update s e)))
    (filter (fun e => negb (state_eqb (update s e) s)) alphabet).

Definition compile : machine :=
  mkMachine "list" (enc initial)
    (map (fun s => (enc s, mkNode (transitions s) (view s))) reachable).

(** ** Facts checked by evaluation *)

Definition closedb : bool :=
  forallb (fun s => forallb (fun e => memb (update s e) reachable) alphabet)
    reachable.

Lemma reachable_closed_alphabet : closedb = true.
Proof. vm_compute. reflexivity. Qed.

Lemma initial_reachable : memb initial reachable = true.
Proof. vm_compute. reflexivity. Qed.

Lemma reachable_names_nodup : nodupb (map enc reachable) = true.
Proof. vm_compute. reflexivity. Qed.

Lemma reachable_ids_initial :
  forallb (fun s => forallb (fun id => existsb (Nat.eqb id) (ids initial)) (ids s))
    reachable = true.
Proof. vm_compute. reflexivity. Qed.

Theorem compile_wf : wfb compile = true.
Proof. vm_compute. reflexivity. Qed.

Theorem reachable_count : length reachable = 20.
Proof. vm_compute. reflexivity. Qed.

(** ** Closure under every event *)

Lemma ids_in_initial s id :
  In s reachable -> In id (ids s) -> In id (ids initial).
Proof.
  intros Hs Hid. pose proof reachable_ids_initial as H.
  rewrite forallb_forall in H. specialize (H s Hs).
  rewrite forallb_forall in H. specialize (H id Hid).
  apply existsb_exists in H. destruct H as [x [Hx Heq]].
  apply Nat.eqb_eq in Heq. subst. exact Hx.
Qed.

(** An event outside the alphabet is a [Select] of an ID that no
    reachable state contains, so [update] ignores it. *)
Lemma update_outside_alphabet s e :
  In s reachable -> ~ In e alphabet -> update s e = s.
Proof.
  intros Hs He. destruct e as [id | |].
  - apply select_missing_noop. intros Hid. apply He.
    unfold alphabet. apply in_or_app. left. apply in_map.
    now apply (ids_in_initial s).
  - exfalso. apply He. unfold alphabet. apply in_or_app. simpl. auto.
  - exfalso. apply He. unfold alphabet. apply in_or_app. simpl. auto.
Qed.

Lemma reachable_closed s e : In s reachable -> In (update s e) reachable.
Proof.
  intros Hs.
  destruct (In_dec event_eq_dec e alphabet)
    as [He | He].
  - pose proof reachable_closed_alphabet as H. unfold closedb in H.
    rewrite forallb_forall in H. specialize (H s Hs).
    rewrite forallb_forall in H. specialize (H e He).
    now apply memb_In.
  - now rewrite update_outside_alphabet.
Qed.

Lemma run_reachable s es : In s reachable -> In (run s es) reachable.
Proof.
  revert s. induction es as [| e es IH]; simpl; intros s Hs; auto.
  apply IH. now apply reachable_closed.
Qed.

(** ** Lookups in the compiled machine *)

Lemma nodupb_NoDup l : nodupb l = true -> NoDup l.
Proof.
  induction l as [| x l IH]; simpl; intros H; constructor.
  - apply andb_true_iff in H as [H _]. apply negb_true_iff in H.
    intros Hin. assert (existsb (String.eqb x) l = true) by
      (apply existsb_exists; exists x; split; auto; apply String.eqb_refl).
    congruence.
  - apply andb_true_iff in H as [_ H]. auto.
Qed.

Lemma NoDup_map_inj {A B} (f : A -> B) l x y :
  NoDup (map f l) -> In x l -> In y l -> f y = f x -> y = x.
Proof.
  induction l as [| a l IH]; simpl; intros Hnd Hx Hy Heq; [contradiction |].
  inversion Hnd as [| ? ? Hnotin Hnd']; subst.
  destruct Hx as [-> | Hx], Hy as [-> | Hy]; auto.
  - exfalso. apply Hnotin. rewrite <- Heq. now apply in_map.
  - exfalso. apply Hnotin. rewrite Heq. now apply in_map.
Qed.

Lemma enc_inj s t : In s reachable -> In t reachable -> enc s = enc t -> s = t.
Proof.
  intros Hs Ht Heq. symmetry.
  apply (NoDup_map_inj enc reachable s t); auto.
  apply nodupb_NoDup, reachable_names_nodup.
Qed.

Lemma lookup_state s :
  In s reachable ->
  lookup (enc s) (m_states compile) = Some (mkNode (transitions s) (view s)).
Proof.
  intros Hs. unfold compile. cbn [m_states].
  apply (lookup_map_some enc (fun s => mkNode (transitions s) (view s))); auto.
  intros t Ht Heq. now apply enc_inj.
Qed.

Lemma lookup_transition s e :
  lookup (ev_name e) (transitions s) =
  if In_dec event_eq_dec e alphabet then
    if state_eqb (update s e) s then None else Some (enc (update s e))
  else None.
Proof.
  unfold transitions.
  rewrite <- map_map with (f := fun e => e)
    (g := fun e => (ev_name e, enc (update s e))).
  rewrite map_id.
  destruct (In_dec _ e alphabet) as [He | He].
  - destruct (state_eqb (update s e) s) eqn:Eq.
    + apply lookup_map_none. intros y Hy Hname.
      apply ev_name_inj in Hname. subst y.
      apply filter_In in Hy as [_ Hy]. rewrite Eq in Hy. discriminate.
    + apply (lookup_map_some ev_name (fun e => enc (update s e))).
      * apply filter_In. rewrite Eq. auto.
      * intros y _ Hname. now apply ev_name_inj.
  - apply lookup_map_none. intros y Hy Hname.
    apply ev_name_inj in Hname. subst y.
    apply filter_In in Hy as [Hy _]. contradiction.
Qed.

(** ** Correctness *)

Theorem m_step_correct s e :
  In s reachable -> m_step compile (enc s) (ev_name e) = enc (update s e).
Proof.
  intros Hs. unfold m_step. rewrite (lookup_state s Hs). simpl.
  rewrite lookup_transition.
  destruct (In_dec _ e alphabet) as [He | He].
  - unfold state_eqb. destruct (state_eq_dec (update s e) s) as [Eq | _];
      congruence.
  - now rewrite update_outside_alphabet.
Qed.

Theorem compile_simulates_from s es :
  In s reachable ->
  m_run compile (enc s) (map ev_name es) = enc (run s es).
Proof.
  revert s. induction es as [| e es IH]; simpl; intros s Hs; auto.
  unfold m_run in *. simpl. rewrite m_step_correct by exact Hs.
  apply IH. now apply reachable_closed.
Qed.

Theorem compile_simulates es :
  m_run compile (m_initial compile) (map ev_name es) = enc (run initial es).
Proof.
  apply compile_simulates_from. apply memb_In, initial_reachable.
Qed.

Theorem compile_meta_is_view s :
  In s reachable -> m_meta compile (enc s) = Some (view s).
Proof. intros Hs. unfold m_meta. now rewrite lookup_state. Qed.

(** Running the machine on the names of [es] lands in the state that
    encodes [run initial es], and that state's [meta] is the proved view.
    Distinct reachable states get distinct keys ([enc_inj]), so the key
    identifies the Rocq state exactly. *)
Theorem compile_correct es :
  m_run compile (m_initial compile) (map ev_name es) = enc (run initial es) /\
  m_meta compile (m_run compile (m_initial compile) (map ev_name es)) =
    Some (view (run initial es)).
Proof.
  rewrite compile_simulates. split; auto.
  apply compile_meta_is_view, run_reachable, memb_In, initial_reachable.
Qed.
