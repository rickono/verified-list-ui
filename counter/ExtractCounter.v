(** * Extraction entry point for the counter (XState with context).

    Same policy as xstate/ExtractJson.v: [ExtrOcamlBasic] only, no [nat],
    [string], or [ascii] mappings.  [emit.ml] decodes the characters and
    writes them to stdout. *)

From Stdlib Require Extraction ExtrOcamlBasic.
From VerifiedListUI Require Import CounterOut.

Extraction Language OCaml.
Set Warnings "-extraction-default-directory".

Extraction "counter_out.ml" counter_js counter_oracle_text.
