# Source verifier roadmap

Status as of 2026-11-10: A, B, C, D and F are integrated. I is complete. E (loop induction) is merged through PR #3. J proves the pinned unchanged Lodash search helper and is validated on a feature branch, awaiting integration.

All prerequisites apply. I combines the five original branches. E is integrated; J builds on it. G, H, P and T are ready to start. Transitively redundant edges are omitted.

```mermaid
flowchart TD
  NOW["NOW: Current verifier<br/>integrated baseline"]
  A["A: Scalar state &amp; control flow<br/>integrated"]
  B["B: Proof scaling &amp; backend API<br/>integrated"]
  C["C: Project frontend<br/>integrated"]
  D["D: Expand soundness checks<br/>integrated"]
  F["F: Richer specifications<br/>integrated"]
  I{{"I: Integrate &amp; validate<br/>integrated"}}
  E["E: Loops with induction<br/>integrated"]
  G["G: Heap, aliases &amp; frames<br/>READY"]
  H["H: Higher-order contracts<br/>READY"]
  J["J: Search proof pilot<br/>branch-ready"]
  K["K: Broader library proofs"]
  P["P: Project proof workflow<br/>READY"]
  Q["Q: Pure JS/TS proofs &amp; bugs"]
  R["R: Event &amp; lifecycle semantics"]
  S["S: Async ordering model"]
  T["T: Environment contracts<br/>READY"]
  U["U: Temporal verification"]
  V["V: Stateful app pilots"]
  W["W: Existing JS/TS verification"]
  NOW --> A
  NOW --> B
  NOW --> C
  NOW --> D
  NOW --> F
  A --> I
  B --> I
  C --> I
  D --> I
  F --> I
  I --> E
  I --> G
  I --> H
  E --> J
  J --> K
  G --> K
  H --> K
  I --> P
  K --> Q
  P --> Q
  G --> R
  H --> R
  G --> S
  H --> S
  I --> T
  R --> U
  S --> U
  T --> U
  U --> V
  P --> V
  Q --> W
  V --> W
```

## Combined validation

Integration checkpoint I passed 168/168 tests, including the three Remeda checks that timed out on D's isolated branch. That run detected all eight original verifier mutants. [Integration report](../verify/reports/integration.md).

## Loop induction delivery

E was merged at `80ed2fd`. Its delivery suite passes 189 tests, including 21 loop tests. The expanded corpus detects 10 verifier mutants. [Loop validation report](https://github.com/rickono/verified-list-ui/blob/f76a14625340ca5426937d9034fd1c143e5da2d7/verify/reports/loops.md). J builds on this integrated capability.

## Upstream search delivery

J is implemented and awaiting integration on `feat/upstream-search-proof`. The pinned Lodash strictIndexOf function verifies unchanged, and 2 seeded bugs produce replay-confirmed counterexamples. The combined run passed 199/199 tests. The raw export passes 261 native comparisons. [Search validation report](../verify/reports/upstream-search.md).

## Original branch results

These counts describe the original isolated branches. D's original partial result is retained as historical evidence; the combined validation above closes that acceptance gap.

| Work | Commit and report | Reported validation |
| --- | --- | --- |
| A: Scalar state & control flow | [46c8f78](https://github.com/rickono/verified-list-ui/blob/46c8f7884b3447a72ccae7e2cc95f43390baf4a2/verify/reports/ready-A.md) on `t3/implement-ready-node-a` | 100 passed, 0 failed |
| B: Proof scaling & backend API | [abd0bf5](https://github.com/rickono/verified-list-ui/blob/abd0bf5202729b1fa0872613c7bfdd46a06a1d93/verify/reports/ready-B.md) on `t3/proof-backend-scheduling` | 104 passed, 0 failed |
| C: Project frontend | [304587c](https://github.com/rickono/verified-list-ui/blob/304587c9a827b3bf38912b4c5acf1ed9a12da11e/verify/reports/ready-C.md) on `t3/implement-ready-node-c` | 105 passed, 0 failed; final frontend recheck 22/22 after the last path fix |
| D: Expand soundness checks | [4a628d3](https://github.com/rickono/verified-list-ui/blob/4a628d3d5c76f6d0d0b893e2019073d7fbf8740d/verify/reports/ready-D.md) on `t3/implement-ready-node-d` | 84 passed, 3 failed; focused corpus passed, eight seeded mutants detected; acceptance partial |
| F: Richer specifications | [3aa07f3](https://github.com/rickono/verified-list-ui/blob/3aa07f3fa9901057e62de195ff5d2210c69679c2/verify/reports/ready-F.md) on `t3/implement-ready-now-node-f` | 102 passed, 0 failed |

## Data and updates

[The graph data](verification-roadmap.json) contains the dependency edges, capability requirements, acceptance criteria and branch evidence. The integration baseline is `ff2518cd7494300084f2ab54da71f4d79185e586`.

Ready packages: G, H, P, T.
Branches awaiting integration: J.

To regenerate this document after editing the data:

```sh
python3 scripts/render-verification-roadmap.py
```
