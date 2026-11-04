(** * Assumptions report for every required theorem.

    [scripts/check-assumptions.sh] fails the build unless each report below
    reads "Closed under the global context", i.e. no axioms at all. *)

From VerifiedListUI Require Import ListUI ListUIProofs View XState Compile Json.

Print Assumptions initial_valid.
Print Assumptions update_preserves_validity.
Print Assumptions run_preserves_validity.
Print Assumptions intermediate_states_valid.
Print Assumptions trace_valid.
Print Assumptions select_existing_spec.
Print Assumptions select_missing_noop.
Print Assumptions delete_none_noop.
Print Assumptions delete_selected_spec.
Print Assumptions delete_selected_length.
Print Assumptions delete_selected_removes_id.
Print Assumptions reset_spec.
Print Assumptions delete_twice_noop.
Print Assumptions reset_idempotent.
Print Assumptions view_rows_match_items.
Print Assumptions view_rows_positionwise.
Print Assumptions view_row_selected_iff.
Print Assumptions view_exactly_one_selected.
Print Assumptions view_none_selected.
Print Assumptions view_delete_enabled_iff.
Print Assumptions view_delete_enabled_effective.
Print Assumptions view_empty_message_iff.

(** XState backend *)
Print Assumptions ev_name_inj.
Print Assumptions reachable_closed.
Print Assumptions enc_inj.
Print Assumptions compile_wf.
Print Assumptions reachable_count.
Print Assumptions m_step_correct.
Print Assumptions compile_simulates.
Print Assumptions compile_meta_is_view.
Print Assumptions compile_correct.
Print Assumptions config_safe.
Print Assumptions oracle_safe.

(** Counter: XState with context.  Qualified, because Counter.v reuses
    names like [initial] and [update]. *)
From VerifiedListUI Require CtxJs Counter CounterMachine CounterOut.

Print Assumptions Counter.count_below_limit.
Print Assumptions Counter.update_inv.
Print Assumptions Counter.disabled_noop.
Print Assumptions Counter.add_enabled_iff.
Print Assumptions Counter.add_spec.
Print Assumptions Counter.sub_enabled_iff.
Print Assumptions Counter.locked_only_unlock.
Print Assumptions Counter.every_count_reachable.
Print Assumptions Counter.changes_unbounded.
Print Assumptions CounterMachine.counter_wf.
Print Assumptions CounterMachine.step_correct.
Print Assumptions CounterMachine.can_correct.
Print Assumptions CounterMachine.meta_correct.
Print Assumptions CounterMachine.run_correct.
Print Assumptions CounterMachine.unknown_ignored.
Print Assumptions CounterMachine.machine_count_below_limit.
Print Assumptions CounterMachine.machine_context_ok.
Print Assumptions CounterOut.counter_oracle_safe.

(** Counter: events from JavaScript (event schemas). *)
Print Assumptions CounterMachine.js_step_correct.
Print Assumptions CounterMachine.js_count_below_limit.
Print Assumptions CounterMachine.payload_max_safe.
Print Assumptions CounterMachine.step_exact.
Print Assumptions CounterMachine.js_exact.
Print Assumptions CounterOut.oracle_events_admitted.
Print Assumptions CtxJs.ndigits_examples.

(** Counter: Foldkit backend (Effect Schema messages, saved in a
    KeyValueStore).  Qualified, like the counter above. *)
From VerifiedListUI Require Fold CounterFold CounterFoldOut.

Print Assumptions Fold.update_rejected.
Print Assumptions Fold.update_no_clauses.
Print Assumptions Fold.fits_spec.
Print Assumptions Fold.run_keeps.
Print Assumptions Fold.cmds_keep.
Print Assumptions Fold.fold_keeps.
Print Assumptions Fold.fold_saves_keep.
Print Assumptions Fold.restores_fits.
Print Assumptions Fold.fold_fields.
Print Assumptions CounterFold.counter_wf.
Print Assumptions CounterFold.init_correct.
Print Assumptions CounterFold.update_correct.
Print Assumptions CounterFold.can_correct.
Print Assumptions CounterFold.run_correct.
Print Assumptions CounterFold.raw_message.
Print Assumptions CounterFold.restore_enc.
Print Assumptions CounterFold.keeps_below_cap.
Print Assumptions CounterFold.fold_below_cap.
Print Assumptions CounterFold.saves_below_cap.
Print Assumptions CounterFold.fold_amount_fits.
Print Assumptions CounterFold.fold_count_below_limit.
Print Assumptions CounterFold.fold_saves.
Print Assumptions CounterFold.save_restore.
Print Assumptions CounterFold.saves_restore.
Print Assumptions CounterFold.payload_max_safe.
Print Assumptions CounterFold.fold_model_fits.
Print Assumptions CounterFold.fold_exact.
Print Assumptions CounterFold.init_exact.
Print Assumptions CounterFold.restored_exact.
Print Assumptions CounterFoldOut.counter_fold_oracle_safe.

(** List UI: Foldkit backend (optional numbers and lists of records,
    both saved in a KeyValueStore).  The same Fold.v language and printer
    as the counter. *)
From VerifiedListUI Require ListFold ListFoldOut.

Print Assumptions Fold.entries_apply.
Print Assumptions Fold.opt_apply.
Print Assumptions Fold.has_id_in.
Print Assumptions Fold.ids_unique_nodup.
Print Assumptions ListFold.list_wf.
Print Assumptions ListFold.init_correct.
Print Assumptions ListFold.saved_enc.
Print Assumptions ListFold.restore_none.
Print Assumptions ListFold.update_correct.
Print Assumptions ListFold.can_correct.
Print Assumptions ListFold.can_delete.
Print Assumptions ListFold.run_correct.
Print Assumptions ListFold.raw_message.
Print Assumptions ListFold.update_labels_ok.
Print Assumptions ListFold.fits_enc.
Print Assumptions ListFold.restore_valid.
Print Assumptions ListFold.save_restore.
Print Assumptions ListFold.fold_run.
Print Assumptions ListFold.fold_run_empty.
Print Assumptions ListFold.keeps_good.
Print Assumptions ListFold.fold_valid.
Print Assumptions ListFold.fold_saves_restore.
Print Assumptions ListFold.fold_model_fits.
Print Assumptions ListFold.fold_exact.
Print Assumptions ListFoldOut.list_fold_oracle_safe.
