(** * Extraction entry point for the Foldkit programs (counter and list).

    Same policy as counter/ExtractCounter.v: [ExtrOcamlBasic] only, no
    [nat], [string], or [ascii] mappings.  [emit.ml] decodes the characters
    and writes them to stdout. *)

From Stdlib Require Extraction ExtrOcamlBasic.
From VerifiedListUI Require Import CounterFoldOut ListFoldOut.

Extraction Language OCaml.
Set Warnings "-extraction-default-directory".

Extraction "fold_out.ml" counter_ts counter_fold_oracle_text list_ts list_fold_oracle_text.
