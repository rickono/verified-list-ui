import type { Plugin } from "vite";

export interface FoldOptions {
  /** The rocq binary. Default: <repo>/_opam/bin/rocq. */
  rocq?: string;
  /** The compiled VerifiedListUI theory. Default: <repo>/_build/default/theories. */
  theories?: string;
  /** Header names are relative to this directory. Default: the repository. */
  labelRoot?: string;
}

export default function fold(options?: FoldOptions): Plugin;
