(** * Extraction entry point for the XState backend.

    Extracts the two JSON texts as OCaml values of the extracted [string]
    type.  The same [ExtrOcamlBasic]-only policy as extraction/Extract.v
    applies: no [nat], [string], or [ascii] mappings.  [emit.ml] decodes the
    characters and writes them to stdout; it does no other work. *)

From Stdlib Require Extraction ExtrOcamlBasic.
From VerifiedListUI Require Import Json.

Extraction Language OCaml.
Set Warnings "-extraction-default-directory".

Extraction "xstate_json.ml" config_text oracle_text.
