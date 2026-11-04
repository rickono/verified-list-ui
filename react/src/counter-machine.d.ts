// The module emitted by Rocq (`make counter`), aliased in vite.config.ts.
declare module "@counter" {
  import type { AnyStateMachine } from "xstate";
  export const machine: AnyStateMachine;
}
