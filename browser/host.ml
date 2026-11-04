(* Browser host for the verified list UI.

   This is the only handwritten code on the execution path, and it is trusted
   (tested, not proved).  It owns the current state privately, turns DOM
   clicks into extracted [Verified_core.event] values, applies the extracted
   [update], and copies the extracted [view] into the DOM.  It never decides
   which row is selected, whether deletion is possible, or what the next state
   is.  Nothing is exported to JavaScript. *)

open Js_of_ocaml
module Core = Verified_core

(* -- Decoding extracted data for display ---------------------------------

   Rocq [nat] and [string] are extracted without native mappings, so the host
   decodes them here.  These decoders are used only to produce DOM text and
   attributes; events carry the original extracted [nat]. *)

let int_of_nat n =
  let rec go acc = function Core.O -> acc | Core.S m -> go (acc + 1) m in
  go 0 n

(* Rocq's [Ascii] stores its bits least significant first. *)
let char_of_ascii (Core.Ascii (b0, b1, b2, b3, b4, b5, b6, b7)) =
  let bit b k = if b then 1 lsl k else 0 in
  Char.chr
    (bit b0 0 lor bit b1 1 lor bit b2 2 lor bit b3 3
     lor bit b4 4 lor bit b5 5 lor bit b6 6 lor bit b7 7)

let string_of_rocq s =
  let buf = Buffer.create 16 in
  let rec go = function
    | Core.EmptyString -> ()
    | Core.String (c, rest) -> Buffer.add_char buf (char_of_ascii c); go rest
  in
  go s;
  Buffer.contents buf

(* -- DOM handles ---------------------------------------------------------- *)

let doc = Dom_html.document

let by_id coerce id =
  match Js.Opt.to_option (Js.Opt.bind (doc##getElementById (Js.string id)) coerce) with
  | Some el -> el
  | None -> failwith ("verified-list-ui: missing element #" ^ id)

let list_el = by_id Dom_html.CoerceTo.ul "items"
let empty_el = by_id Dom_html.CoerceTo.p "empty"
let delete_btn = by_id Dom_html.CoerceTo.button "delete"
let reset_btn = by_id Dom_html.CoerceTo.button "reset"

(* -- Private state and serialized dispatch -------------------------------- *)

let state = ref Core.initial
let pending : Core.event Queue.t = Queue.create ()
let dispatching = ref false

let rec dispatch ev =
  Queue.push ev pending;
  (* JavaScript runs handlers one at a time, but a queue keeps processing
     serialized even if rendering ever triggered a nested event. *)
  if not !dispatching then begin
    dispatching := true;
    Fun.protect
      ~finally:(fun () -> dispatching := false)
      (fun () ->
        while not (Queue.is_empty pending) do
          state := Core.update !state (Queue.pop pending);
          render ()
        done)
  end

and render () =
  let v = Core.view !state in
  while Js.Opt.test list_el##.firstChild do
    Js.Opt.iter list_el##.firstChild (fun c -> Dom.removeChild list_el c)
  done;
  List.iter (fun r -> Dom.appendChild list_el (render_row r)) v.Core.rows;
  empty_el##.style##.display := Js.string (if v.Core.show_empty_message then "" else "none");
  delete_btn##.disabled := Js.bool (not v.Core.delete_enabled)

and render_row (r : Core.row) =
  let li = Dom_html.createLi doc in
  let b = Dom_html.createButton ~_type:(Js.string "button") doc in
  let pressed = r.Core.row_selected in
  b##.textContent := Js.some (Js.string (string_of_rocq r.Core.row_label));
  b##setAttribute (Js.string "aria-pressed") (Js.string (if pressed then "true" else "false"));
  b##setAttribute (Js.string "data-id") (Js.string (string_of_int (int_of_nat r.Core.row_id)));
  b##.className := Js.string (if pressed then "row selected" else "row");
  (* Capture only the item ID; the next state is always computed from the
     latest state inside [dispatch]. *)
  let id = r.Core.row_id in
  b##.onclick := Dom_html.handler (fun _ -> dispatch (Core.Select id); Js._false);
  Dom.appendChild li b;
  li

let () =
  delete_btn##.onclick := Dom_html.handler (fun _ -> dispatch Core.DeleteSelected; Js._false);
  reset_btn##.onclick := Dom_html.handler (fun _ -> dispatch Core.Reset; Js._false);
  render ()
