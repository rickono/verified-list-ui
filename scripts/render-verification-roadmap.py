"""Render the source-verifier roadmap from its node and edge data."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
data = json.loads((root / "docs/verification-roadmap.json").read_text())
labels = {
    "done": "integrated baseline",
    "branch_ready": "branch-ready",
    "partial": "PARTIAL",
    "next": "NEXT",
}
lines = [
    "# Source verifier roadmap",
    "",
    f"Status as of {data['asOf']}: A, B, C and F are ready in separate branches for their documented subsets. D is partial because three baseline Remeda checks returned unknown. No implementation branches are merged, and no downstream work has started.",
    "",
    "I is the next integration and combined-validation checkpoint. All incoming prerequisites apply. Inputs to I are delivered branch artifacts, including D with its unresolved acceptance gap. Downstream work requires I to pass. Transitively redundant edges are omitted.",
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
    "```", "", "## Independent branch results", "",
    "Test counts below describe each isolated branch. There is no combined integration result.", "",
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
    "[The graph data](verification-roadmap.json) contains the dependency edges, capability requirements, acceptance criteria and branch evidence. The baseline is `ff2518cd7494300084f2ab54da71f4d79185e586` on `js-source-verifier`. This roadmap is on `ready-now-coordinator`.",
    "", "To regenerate this document after editing the data:", "",
    "```sh", "python3 scripts/render-verification-roadmap.py", "```", "",
]
(root / "docs/verification-roadmap.md").write_text("\n".join(lines))
