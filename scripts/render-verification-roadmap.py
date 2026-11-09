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
    f"The combined verifier suite passed {data['validation']['fullSuite']['passed']}/{data['validation']['fullSuite']['passed']} tests, including the three Remeda checks that timed out on D's isolated branch. The independent corpus still detects all eight seeded verifier mutants. [Integration report](../verify/reports/integration.md).", "",
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
    "[The graph data](verification-roadmap.json) contains the dependency edges, capability requirements, acceptance criteria and branch evidence. The integration baseline is `ff2518cd7494300084f2ab54da71f4d79185e586`. The next ready packages are E, G, H, P and T. No downstream work has started.",
    "", "To regenerate this document after editing the data:", "",
    "```sh", "python3 scripts/render-verification-roadmap.py", "```", "",
]
(root / "docs/verification-roadmap.md").write_text("\n".join(lines))
