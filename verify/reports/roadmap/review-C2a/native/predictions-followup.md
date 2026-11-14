# Follow-up predictions

The first `repair-settle` result is confounded: `search` itself does not write `x`, so its action cut already violates `x !== old(x)` before settlement. These predictions were frozen before the follow-up run.

1. An entry that flips `x` before `await`, then flips it back after resume: the call alone has no violation and leaves `x` true.
2. A later standalone abort violates `always` and leaves `x` true.
3. `settle-abort` after that call has no violation. The resume runs before the settlement cut, so the cut sees the second flip (`x` false), the request stays settled, the invocation stays present, and the owned signal is aborted.
4. A crafted call argument `{type:"handle",sort:"signal",id:"01"}`, bypassing `traceOf`, is `illegal-environment-action`.
