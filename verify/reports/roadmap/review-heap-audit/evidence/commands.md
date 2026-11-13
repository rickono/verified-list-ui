# Commands and results

Review checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-166adcab`, branch `t3/heap-write-audit-review`, starting head `59ea39d7e579a0f3966629dc5980a63525309902`.

Implementation head: `7444276bfce715cf1aabe9ba50c985a291dbea5e`. Parent: `eaf23c0ca4a2e61e9d844a84a876755872eb16e7`.

```
git merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b 7444276bfce715cf1aabe9ba50c985a291dbea5e
```

Exit 0. `git cat-file -e 7444276:verify` succeeded. `git diff --name-only eaf23c0 7444276 -- verify ':!verify/design' ':!verify/reports'` printed only `verify/heap.mjs`. `git rev-parse 7444276:verify/heap.mjs` is `0607e95df2cfbff65505680997ae1cceff695fab`.

Receipt hashes were recomputed with Python `hashlib.sha256` against the files named in `evidence.json`. All ten raw-log records matched, including `comparison-accepted/tree-hashes.json` (`a6fdd3ba1b7f188f29edb80b7503363fbeb13b659a1379b4cf9b76c6a6c1bc2d`). `parent-snapshot.log` and `comparison-final.log` are both 41 bytes and share sha256 `54c1dcefee9bbeb12d2cbb279b332ddded4dd30461ee3c3826170db0bc7add2d`. Their text is `Waiting for the shared solver test lane.`

Saved comparison JSON, parent versus current, `filecmp` via equal byte strings:

- queries `96d0c0e32e5461e9c3ef2f9cc546437dcebd893f4f169f06b9a8a2090a05146b` (2009998 bytes, 629 rows, 616 with `query`, 13 with `error`)
- smt `27c49c444205d6c4f7cb35746cf7a57bda08a0b080f41c71bc454e6af22fb942` (1570478 bytes, 616 rows)
- runtime `e9fb04b13ebe2e6e701b976140bc0459cd4ec5e49932acb073ae4445bb8277a5` (20335 bytes, 14 rows)
- native `48fe93f548b7204472bef384ec7a85bcd26846415f635ecb70efa8af67960cc1` (3558 bytes, 14 entries, 40 samples)
- sources `90009f81e13ae41a8e4c4d7f2d4c70cee0a5f457471b63b97a0a0defdab8003a` (8014 bytes, 44 rows)

`focused-final.log` tail: tests 90, pass 90, fail 0, cancelled 0, skipped 0. Mutant lines match the receipt.

Archives, then a dependency link, removed after the runs:

```
git archive eaf23c0ca4a2e61e9d844a84a876755872eb16e7 | tar -x -C /tmp/heap-review/parent
git archive 7444276bfce715cf1aabe9ba50c985a291dbea5e | tar -x -C /tmp/heap-review/child
ln -s /Users/rick/verification-vibes/verified-list-ui/node_modules /tmp/heap-review/parent/node_modules
ln -s /Users/rick/verification-vibes/verified-list-ui/node_modules /tmp/heap-review/child/node_modules
```

Archive heap sha256 values: child `25bccf21abbb3e5a4c94fd88ceae26124436385daebd0c08b0ed8fc8f00d7311`, parent `3a833de64dca47275accc84371a451f84ba5905fea618ffe2935149269e50f9a`. `cmp` on `verify/source.mjs` was identical.

Boundary tests, cwd `/tmp/heap-review/child`, no solver:

```
node --test --test-concurrency=1 --test-name-pattern 'unknown versions|record named|private |exit writes|both symbolic|intervals distinguish|existing fresh|cutpoints preserve|record, boolean' tests/verify/heap-write-audit.test.mjs
```

Exit 0. tests 14, pass 14, fail 0, duration_ms 84.458416. Output: `boundary.tap`. The six diagnostics:

- `13f63babef92972251b50243b47673022949c04790d8e9fc50d3b4012b9ad11f`
- `78aeaf72c25c5b3fdb9a8176f96afa7319e9953ed3536e077eb776128f7e3a41`
- `71c12d040c16393a14a0cb54b2d8001bb7aba0bb6d3b18312543dbdd6d10724b`
- `1cc51352bfe9a52522131e54f8c939dccb8006ef15c378f4747cc7cc8ce08264`
- `890d3db42ef01ab9ed6825c0d0836c90f6c53bc45b83a8ec2aed2c81f8a8815b`
- `5e5940b0b9ce438f62410f7e8252ed34e37a5bfc56732b58cf138ab4a1fe82da`

Adversaries, no solver:

```
node /tmp/heap-review/adversaries.mjs
```

Exit 0. `{"summary":{"checks":59,"failed":0,"names":[]}}`. Stdout is `adversary.jsonl` (60 lines). Stderr was only Node's `NO_COLOR` / `FORCE_COLOR` warning. The script copy in this directory is the program that produced that summary.

After the runs:

```
rm /tmp/heap-review/parent/node_modules /tmp/heap-review/child/node_modules
```

No `adversaries.mjs` or `heap-write-audit.test` process remained.
