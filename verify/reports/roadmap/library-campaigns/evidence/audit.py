"""Capture package integrity and cleanup after the focused campaign; no solver."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess

root = Path(__file__).resolve().parents[5]
pkg = root / 'verify/reports/roadmap/library-campaigns'
def sha(data): return hashlib.sha256(data).hexdigest()
def git(*args): return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
def load(file): return json.loads(file.read_text())
def save(file, data): file.write_text(json.dumps(data, indent=2) + '\n')
inputs = load(pkg / 'inputs.json')
final = pkg / 'evidence/03-final'
run = load(final / 'run.json')
evidence = load(final / 'evidence.json')
assert run['status'] == evidence['status'] == 'PASS'
assert all(s['status'] == 'PASS' for s in evidence['stages'])
assert len(evidence['stages']) == 10
assert load(pkg / 'evidence/05-drift-controls/result.json')['status'] == 'PASS'
link = root / 'node_modules'
link_target = os.readlink(link) if link.is_symlink() else None
previous_cleanup = load(pkg / 'cleanup.json') if (pkg / 'cleanup.json').exists() else {}
recorded_link = link_target or previous_cleanup.get('dependencyLinkBefore')
expected_link = '/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules'
assert link_target in [None, expected_link]
if link_target:
    link.unlink()
assert not link.exists() and not link.is_symlink()
assert not list(pkg.glob('.drift-control-*'))
ps = subprocess.check_output(['ps', '-ax', '-o', 'pid=,ppid=,pgid=,state=,command='], text=True)
processes = {int(row.split(None, 1)[0]): row.strip() for row in ps.splitlines() if row.strip()}
owned_pids = set()
for folder in ['02-campaign', '03-final']:
    r = load(pkg / f'evidence/{folder}/run.json')
    assert not r['remainingProcessGroupAfterWait']
    owned_pids.update([r['lanePid'], r['supervisorPid']])
    for file in (pkg / f'evidence/{folder}').glob('*.command.json'):
        c = load(file)
        assert c['aliveAfterWait'] is False
        owned_pids.add(c['pid'])
live_known = {p: processes[p] for p in owned_pids if p in processes}
assert not live_known, live_known
source_processes = [r for r in processes.values() if str(root) in r and
                    ('verify/solver.mjs' in r or '/library-campaigns/check.mjs' in r)]
assert not source_processes, source_processes
save(pkg / 'cleanup.json', {
    'status': 'PASS', 'classification': 'finite control', 'origin': 'own execution',
    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'dependencyLinkBefore': recorded_link, 'dependencyLinkRemoved': True,
    'scratchDirectoriesRemaining': [], 'knownCompletedPids': sorted(owned_pids),
    'liveKnownPids': live_known, 'liveOwnedCommandMatches': source_processes,
    'processCommand': ['ps', '-ax', '-o', 'pid=,ppid=,pgid=,state=,command='],
    'nativeReaping': 'Every spawnSync command recorded aliveAfterWait=false. Both timeout children per run have ETIMEDOUT/SIGKILL.',
    'solverReaping': 'Production backend.close kills and awaits each solver child. Each campaign supervisor observed an empty owned process group after wait.',
    'driftControls': 'Finite-control process groups ended and temporary copies were removed. Earlier lane-only controls were killed and waited, with no Node or solver started.',
})
matched_inputs = 0
for file, expected in inputs['files'].items():
    assert sha((root / file).read_bytes()) == expected, file
    matched_inputs += 1
artifact_checks = 0
for folder in ['02-campaign', '03-final']:
    directory = pkg / 'evidence' / folder
    for record in ['run.json', 'evidence.json']:
        for file, entry in load(directory / record)['artifacts'].items():
            assert sha((directory / file).read_bytes()) == entry['sha256'], (folder, file)
            artifact_checks += 1
protected_args = ['diff', inputs['preparedParent'], '--', '.', ':(exclude)verify/reports/roadmap/library-campaigns/**']
assert git(*protected_args) == ''
production = [file for file in inputs['files'] if file.startswith('verify/') and
              (file.count('/') == 1 or file.startswith('verify/bin/'))]
production += ['pnpm-lock.yaml', 'package.json']
runtime_args = ['diff', '--name-only', inputs['runtimeEquivalentTo'], 'HEAD', '--', *production]
assert git(*runtime_args) == ''
subprocess.run(['git', 'merge-base', '--is-ancestor', inputs['baseline'], 'HEAD'], cwd=root, check=True)
assert load(final / 'freeze.before.json') == load(final / 'freeze.after.json')
assert load(final / 'supervisor-freeze.before.json') == load(final / 'supervisor-freeze.after.json')
save(pkg / 'integrity.json', {
    'status': 'PASS', 'classification': 'finite control', 'origin': 'own execution',
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'command': ['python3', str(Path(__file__).resolve())],
    'codeHead': git('rev-parse', 'HEAD'), 'testedHead': run['codeHead'],
    'inputFilesMatched': matched_inputs, 'recordedArtifactHashComparisons': artifact_checks,
    'finalStagesPassed': len(evidence['stages']),
    'preparedFilesHashed': load(final / 'freeze.before.json')['fileCount'],
    'preparedFilesDigest': load(final / 'freeze.before.json')['allPreparedFilesSha256'],
    'protectedDiffCommand': ['git', *protected_args], 'protectedDiff': 'empty',
    'runtimeEquivalenceCommand': ['git', *runtime_args], 'runtimeEquivalenceDiff': 'empty',
    'baselineAncestor': True, 'productionAndLockfileUnchanged': True,
    'failedExperimentsRetained': ['evidence/02-campaign', 'evidence/04-drift-controls', 'evidence/06-integrity-setup'],
    'failedControlCorrection': 'evidence/04-drift-controls/correction.json',
    'proofSubset': 'No full suite; no benchmark measurement.',
})
artifacts = {}
run_indexes = {folder: load(pkg / f'evidence/{folder}/run.json')['artifacts'] for folder in ['02-campaign', '03-final']}
for file in sorted(pkg.rglob('*')):
    if not file.is_file() or file.name in ['manifest.json', 'SHA256SUMS']:
        continue
    name = str(file.relative_to(pkg))
    classification = 'finite control'
    origin = 'own package code, run metadata, documentation or finite control; not a theorem'
    if name.startswith('pins/') or name == 'provenance.json':
        origin = 'inherited pinned input, locally checked; not a theorem'
    for folder in ['02-campaign', '03-final']:
        marker = f'evidence/{folder}/'
        if name.startswith(marker):
            entry = run_indexes[folder].get(name[len(marker):])
            if entry:
                classification, origin = entry['classification'], entry['origin']
            else:
                origin = 'own execution; run summary'
    if name.startswith('evidence/01-admission/'):
        classification, origin = 'unknown/unsupported', 'own unsupported admission observation; no solver'
    if name.startswith('evidence/04-drift-controls/'):
        classification = 'unknown/unsupported'
        origin = 'failed auxiliary lane wait; no source-verifier command ran; see correction.json'
    artifacts[name] = {'sha256': sha(file.read_bytes()), 'classification': classification, 'origin': origin}
claims = []
for original in evidence['claims']:
    claim = dict(original)
    for field in ['artifact', 'evidence']:
        if field in claim:
            claim[field] = 'evidence/03-final/' + claim[field]
    claims.append(claim)
save(pkg / 'manifest.json', {
    'schema': 1, 'status': 'PASS',
    'scope': 'Maintained pinned numerical campaign package only; independent review and final integration pending.',
    'package': 'verify/reports/roadmap/library-campaigns', 'checkout': str(root),
    'baselineAncestor': inputs['baseline'], 'preparedParent': inputs['preparedParent'],
    'runtimeEquivalentTo': inputs['runtimeEquivalentTo'],
    'implementationCommits': ['cf7c183a6cefcf14742738bc11e21a695f99cb67', '42567fc7b286e2a8e838279396fcb444e1118253'],
    'testedHead': run['codeHead'], 'testedCheckerSha256': sha((pkg / 'check.mjs').read_bytes()),
    'inputManifestSha256': sha((pkg / 'inputs.json').read_bytes()), 'modelIdentity': evidence['modelIdentity'],
    'sourceGraphSha256': load(final / 'harmonic/checks.json')['graphSha256'],
    'runtime': load(final / 'model.json')['runtime'], 'pinDate': '2026-11-13', 'timeZone': 'America/Chicago',
    'freshFinalRun': 'evidence/03-final/run.json', 'finalStagesPassed': len(evidence['stages']),
    'budgetMs': {'eachPublicProofRequest': 60000, 'eachNativeCycleSubprocess': 2000,
                 'nativeFiniteSubprocess': 10000, 'cliReproduction': 15000,
                 'unsupportedAdmissionRequest': 1000, 'outerGuard': 600000},
    'sourcePolicy': 'Current production checkers and modules only. d3 native imports use unchanged exact pin bytes. Diagnostic copies are explicitly modified and supply no unchanged-source verifier theorem.',
    'qComplete': False, 'kComplete': False, 'independentReviewComplete': False,
    'currentMainStatusChecked': False, 'noveltyClaimed': False, 'upstreamAcknowledgementOrFixClaimed': False,
    'fullSuiteRun': False, 'benchmarkClaim': False, 'productionEdits': False, 'externalMessagesOrIssuePosting': False,
    'claims': claims,
    'experiments': [
        {'path': 'evidence/01-admission', 'result': 'unsupported', 'origin': 'own no-solver admission preflight at prepared parent'},
        {'path': 'evidence/02-campaign', 'result': 'ISSUES', 'reason': 'diagnostic wrapper retained an import; all other stages passed', 'testedHead': 'cf7c183a6cefcf14742738bc11e21a695f99cb67'},
        {'path': 'evidence/03-final', 'result': 'PASS', 'reason': 'all 10 focused stages passed', 'testedHead': run['codeHead']},
        {'path': 'evidence/04-drift-controls', 'result': 'ISSUES', 'reason': '20-second bounds expired waiting for the shared lane before Node ran; premature explanatory field corrected in correction.json'},
        {'path': 'evidence/05-drift-controls', 'result': 'PASS', 'reason': 'source bytes and provenance each refused by the lightweight hash gate before semantic imports or solver launch'},
        {'path': 'evidence/06-integrity-setup', 'result': 'ISSUES', 'reason': 'inventory expected 11 stages, but the passing final list has 10; corrected without changing verifier results'},
    ],
    'trust': evidence['trust'],
    'queryPlans': 'Compiler-generated full/replay query plans are static inferred inputs, not solver transcripts or proof certificates. No external prototype is used.',
    'cleanup': 'cleanup.json', 'integrity': 'integrity.json', 'artifacts': artifacts,
    'selfHash': 'Not self-referential; SHA256SUMS includes this manifest.',
})
entries = []
for file in sorted(pkg.rglob('*')):
    if file.is_file() and file.name != 'SHA256SUMS':
        entries.append(f'{sha(file.read_bytes())}  {file.relative_to(root)}')
(pkg / 'SHA256SUMS').write_text('\n'.join(entries) + '\n')
print(json.dumps({'status': 'PASS', 'inputFiles': matched_inputs, 'artifactHashComparisons': artifact_checks,
                  'packageFilesHashed': len(entries), 'allFinalStages': len(evidence['stages']),
                  'dependencyLinkRemoved': True, 'ownedProcessesRemaining': 0}))
