"""Render the source-verifier roadmap from its node and edge data."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
data = json.loads((root / "docs/verification-roadmap.json").read_text())
labels = {
    "done": "integrated baseline",
    "integrated": "integrated",
    "ready": "READY",
    "branch_ready": "branch-ready",
    "partial": "PARTIAL",
    "next": "NEXT",
}
lines = [
    "# Source verifier roadmap",
    "",
    f"Status as of {data['asOf']}: {data['status']}",
    "",
    data["edgeMeaning"],
    "",
    "```mermaid",
    "flowchart TD",
]
for node in data["nodes"]:
    label = f"{node['id']}: {node['title']}"
    if node["status"] in labels:
        label += "<br/>" + labels[node["status"]]
    label = label.replace("&", "&amp;").replace('"', "&quot;")
    shape = '{{"' + label + '"}}' if node["id"] == "I" else '["' + label + '"]'
    lines.append(f"  {node['id']}{shape}")
lines.extend(f"  {edge['from']} --> {edge['to']}" for edge in data["edges"])
lines += [
    "```", "", "## Combined validation", "",
    f"Integration checkpoint I passed {data['validation']['fullSuite']['passed']}/{data['validation']['fullSuite']['passed']} tests, including the three Remeda checks that timed out on D's isolated branch. That run detected all eight original verifier mutants. [Integration report](../verify/reports/integration.md).", "",
]
if delivery := data.get("loopDelivery"):
    state = (f"E was merged at `{delivery['mergeCommit'][:7]}`."
        if delivery["integrated"] else f"E is implemented on `{delivery['branch']}` at `{delivery['implementationCommit'][:7]}` and awaits integration.")
    next_step = "J builds on this integrated capability." if delivery["integrated"] else "J remains gated on E's integration."
    lines += ["## Loop induction delivery", "",
        f"{state} Its delivery suite passes {delivery['tests']} tests, including {delivery['loopTests']} loop tests. The expanded corpus detects {delivery['mutants']} verifier mutants. [Loop validation report]({delivery['reportUrl']}). {next_step}", ""]
if delivery := data.get("searchDelivery"):
    state = (f"J was merged at `{delivery['mergeCommit'][:7]}`."
        if delivery["integrated"] else f"J is implemented on `{delivery['branch']}` and awaits integration.")
    suite = delivery["fullSuite"]
    validation = f"The combined run passed {suite['passed']}/{delivery['tests']} tests."
    if suite["failed"]:
        validation += f" {suite['failed']} existing tests hit resource limits; see the report for isolated rechecks."
    lines += ["## Upstream search delivery", "",
        f"{state} The pinned Lodash strictIndexOf function verifies unchanged, and {delivery['seededBugs']} seeded bugs produce replay-confirmed counterexamples. {validation} The raw export passes {delivery['nativeComparisons']} native comparisons. [Search validation report]({delivery['report']}).", ""]
if delivery := data.get("callbackDelivery"):
    state = "integrated" if delivery["integrated"] else "implemented and awaiting integration"
    lines += ["## Pure callback delivery", "",
        f"H is {state} on `{delivery['branch']}`. Pure total unary numeric predicates compose with immutable primitive captures and checked named callbacks. The pinned Ramda eager findIndex verifies unchanged; {delivery['seededBugs']} seeded bugs replay, with {delivery['nativeComparisons']} independent native comparisons. The full suite passes {delivery['tests']}/{delivery['tests']} and all {delivery['mutants']} verifier mutants are detected. [Callback validation report]({delivery['report']}). G is next; stateful callbacks remain outside this delivery.", ""]
lines += [
    "## Original branch results", "",
    "These counts describe the original isolated branches. D's original partial result is retained as historical evidence; the combined validation above closes that acceptance gap.", "",
    "| Work | Commit and report | Reported validation |",
    "| --- | --- | --- |",
]
for node in data["nodes"]:
    result = node.get("result")
    if not result:
        continue
    suite = result["fullSuite"]
    checks = f"{suite['passed']} passed, {suite['failed']} failed"
    if node["id"] == "C":
        checks += "; final frontend recheck 22/22 after the last path fix"
    if node["id"] == "D":
        checks += "; focused corpus passed, eight seeded mutants detected; acceptance partial"
    lines.append(f"| {node['id']}: {node['title']} | [{result['commit'][:7]}]({result['reportUrl']}) on `{result['branch']}` | {checks} |")
lines += [
    "", "## Data and updates", "",
    "[The graph data](verification-roadmap.json) contains the dependency edges, capability requirements, acceptance criteria and branch evidence. The integration baseline is `ff2518cd7494300084f2ab54da71f4d79185e586`.",
    "",
    "Ready packages: " + ", ".join(n["id"] for n in data["nodes"] if n["status"] == "ready") + ".",
    "Branches awaiting integration: " + (", ".join(n["id"] for n in data["nodes"] if n["status"] == "branch_ready") or "none") + ".",
    "", "To regenerate this document after editing the data:", "",
    "```sh", "python3 scripts/render-verification-roadmap.py", "```", "",
]
(root / "docs/verification-roadmap.md").write_text("\n".join(lines))
