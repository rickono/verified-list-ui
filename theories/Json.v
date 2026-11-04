(** * JSON for the compiled machine.

    The printer does no escaping.  Instead, [json_safe] requires every
    string, keys included, to be printable ASCII other than the double quote
    and the backslash.  [config_safe] and [oracle_safe] check that by
    evaluation.  Under that condition, each string literal printed below is
    a valid JSON string with the same characters.  The printer itself is
    trusted, and it is small. *)

From Stdlib Require Import String List Bool Ascii.
From VerifiedListUI Require Import ListUI View XState Compile.
Import ListNotations.
Open Scope list_scope.

#[warnings="-register-all"]
Inductive json :=
| JNull
| JBool (b : bool)
| JNum (n : nat)
| JStr (s : string)
| JArr (l : list json)
| JObj (l : list (string * json)).

Definition quote (s : string) : string := ("""" ++ s ++ """")%string.

Fixpoint join (l : list string) : string :=
  match l with
  | [] => ""
  | [x] => x
  | x :: l' => x ++ "," ++ join l'
  end%string.

Fixpoint print (j : json) : string :=
  match j with
  | JNull => "null"
  | JBool true => "true"
  | JBool false => "false"
  | JNum n => digits n
  | JStr s => quote s
  | JArr l => "[" ++ join (map print l) ++ "]"
  | JObj l => "{" ++ join (map (fun kv => quote (fst kv) ++ ":" ++ print (snd kv)) l) ++ "}"
  end%string.

Definition safe_char (c : ascii) : bool :=
  let n := nat_of_ascii c in
  Nat.leb 32 n && Nat.leb n 126 && negb (Nat.eqb n 34) && negb (Nat.eqb n 92).

Fixpoint json_safe (j : json) : bool :=
  match j with
  | JNull | JBool _ | JNum _ => true
  | JStr s => all_chars safe_char s
  | JArr l => forallb json_safe l
  | JObj l => forallb (fun kv => all_chars safe_char (fst kv) && json_safe (snd kv)) l
  end.

(** ** Encoding *)

(** Each row carries the name of the event its button sends, so a renderer
    never builds event names itself.  It is [ev_name] of [Select] of the
    row's ID, the same name [compile_correct] is stated with. *)
Definition row_json (r : row) : json :=
  JObj [("id", JNum (row_id r)); ("label", JStr (row_label r));
        ("selected", JBool (row_selected r));
        ("selectEvent", JStr (ev_name (Select (row_id r))))]%string.

Definition view_json (v : view_t) : json :=
  JObj [("rows", JArr (map row_json (rows v)));
        ("deleteEnabled", JBool (delete_enabled v));
        ("showEmptyMessage", JBool (show_empty_message v))]%string.

Definition node_json (n : node) : json :=
  JObj [("on", JObj (map (fun '(ev, target) => (ev, JStr target)) (n_on n)));
        ("meta", view_json (n_meta n))]%string.

Definition machine_json (m : machine) : json :=
  JObj [("id", JStr (m_id m)); ("initial", JStr (m_initial m));
        ("states", JObj (map (fun '(k, n) => (k, node_json n)) (m_states m)))]%string.

(** The XState config for the list UI. *)
Definition config : json := machine_json compile.

Lemma config_safe : json_safe config = true.
Proof. vm_compute. reflexivity. Qed.

Definition config_text : string := print config.

(** ** Test oracle

    For every reachable state and every test event, the key of the state
    [update] produces.  It is computed from [update] and [enc] directly,
    not from [compile], so the Node test can check XState against the
    application semantics rather than against the machine it was given.
    The test events add [Select] of IDs that never exist. *)

Definition test_events : list event :=
  alphabet ++ [Select 0; Select 4; Select 999].

Definition oracle : json :=
  JArr (flat_map (fun s =>
    map (fun e =>
      JObj [("from", JStr (enc s)); ("event", JStr (ev_name e));
            ("to", JStr (enc (update s e))); ("view", view_json (view (update s e)))]%string)
      test_events) reachable).

Lemma oracle_safe : json_safe oracle = true.
Proof. vm_compute. reflexivity. Qed.

Definition oracle_text : string := print oracle.
