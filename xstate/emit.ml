(* Prints one extracted JSON text to stdout. The only logic here is the
   character decoder (8 bits, least significant first) and the choice of
   which constant to print. *)

module X = Xstate_json

let char_of_ascii (X.Ascii (b0, b1, b2, b3, b4, b5, b6, b7)) =
  let bit b k = if b then 1 lsl k else 0 in
  Char.chr
    (bit b0 0 lor bit b1 1 lor bit b2 2 lor bit b3 3
     lor bit b4 4 lor bit b5 5 lor bit b6 6 lor bit b7 7)

let rec output_rocq buf = function
  | X.EmptyString -> ()
  | X.String (c, s) -> Buffer.add_char buf (char_of_ascii c); output_rocq buf s

let () =
  let text =
    match Sys.argv with
    | [| _; "config" |] -> X.config_text
    | [| _; "oracle" |] -> X.oracle_text
    | _ -> prerr_endline "usage: emit (config|oracle)"; exit 2
  in
  let buf = Buffer.create 65536 in
  output_rocq buf text;
  Buffer.add_char buf '\n';
  print_string (Buffer.contents buf)
