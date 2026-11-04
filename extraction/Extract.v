(** * Extraction entry point.

    The only extraction directives are [ExtrOcamlBasic]'s constructor-for-
    constructor mappings of [bool], [option], [list], [prod], [unit], and
    [sumbool] onto the OCaml types of the same shape.  [nat], [string], and
    [ascii] are extracted as ordinary inductive types (Peano naturals and
    8-bit characters), so no machine-integer or native-string mapping is
    trusted. *)

From Stdlib Require Extraction ExtrOcamlBasic.
From VerifiedListUI Require Import ListUI View.

Extraction Language OCaml.
(* dune runs this file in _build/default/extraction; that is the intended
   output directory. *)
Set Warnings "-extraction-default-directory".

Extraction "verified_core.ml" initial update run view.
