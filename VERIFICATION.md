# LOG-HUB-003 verification report

Verified 2026-11-15 UTC (2026-11-14 Pacific). Existing architecture preserved. No frontend, CMS, database, server, runtime AI dependency, paid plan or upgrade was added.

## Repositories and configuration

- [Public source](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub), ID `1458311725`.
- [Private recovery vault](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub-backups), ID `1458311780`. Privacy verified through the authenticated API.
- [Owner-controlled integration fixture](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub-integration-fixture), ID `1458327252`. Text-only test releases; permanently delisted in production policy. No fictional community listing was published.
- Source Issues, forms, CODEOWNERS and Actions are enabled. Default token permissions are read-only; Actions cannot approve PR reviews. Main requires PRs, strict `test` CI, administrator enforcement, no force pushes or deletion. Final protection requires one approving CODEOWNER review. Setup changes used protected CI-checked PRs before enabling that final requirement; no admin merge bypass was used.
- Backup App `log-backup-automation`, ID `5764581`, installation `182076518`, is installed only on the private vault. Contents write and Metadata read are its only permissions. Jobs mint short-lived repository-scoped tokens reduced to read/write as needed. No broad account PAT was installed in Actions.
- App PEM, production signing key and independent integration signing key are encrypted Actions secrets. Only public verification keys are committed. Numeric source/vault IDs and purpose-bound signatures prevent cross-repository or integration-state substitution.
- `PUBLISHING_ENABLED=true`. Daily publication is configured for 07:23 UTC; backup health for 09:53 UTC. Manual and relevant submission-issue events are supported. No production deployment or website exists.

GitHub Free rejected private rulesets. The free alternative uses private immutable releases and signed snapshots, with content-free public hash receipts. Active source ruleset `27288554` forbids production/integration receipt updates and deletion with no bypass actors. Owner-authenticated inspection verified the full empty bypass list; limited Actions tokens omit this administrator-only field. Actual denial probes attacked the integration receipt and private immutable tag. No paid feature or broader credential was used.

## Durable recovery and actual production results

Snapshots preserve validated registry, records, ownership/release state, normalized images and exact catalog bytes. SHA-256 file descriptors and provenance are signed with Ed25519. Policies, raw HTTP caches, environment files and credentials are excluded. Restoration checks schema, identities, signatures, paths, image dimensions and catalog consistency, then reapplies current protected publishing policy.

Publication is synchronize -> immutable private backup -> protected public receipt -> final byte verification -> artifacts. Failed or unanchored backups cannot authorize publication. Unchanged state reuses an existing verified point. Partial writes preserve older points; existing restore destinations and empty replacement of nonempty state are refused. Corrupt/missing newest points block routine publication; older recovery requires exact administrator rollback approval.

| Operation | Actual result |
|---|---|
| Initial durable recovery | [43660443880](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43660443880), passed |
| First production publication | [43664765782](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43664765782), all four stages passed; unchanged backup reused |
| Production restore after actual deletion of its `catalog-state` artifact `14142305075` | [43664933612](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43664933612), passed using durable vault; no prior Actions state required |
| Independent hosted backup health | [43664937246](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43664937246), passed |

Production point: `43660443880-5d7105d4766b64b37ec52f33f5e25c743769592f1e7cebfcde67a62d8d59b711`.
Private commit: `4cadd39f4b7d4a5706c71c15593b94dec63f2adc`.

Downloaded production catalogs before/after artifact loss contain zero projects and share SHA-256 `5399c6597ab50cc53c7a078a6458562486a4fcc272ef0522d4aba3cff5d9ffbb`. The validation report explicitly excludes the fixture by numeric policy identity. No community-approved project was supplied.

A real production export used a read-only App token, revoked afterward. The normal CLI verified and restored that export offline into a fresh directory without API calls or GitHub tokens, without replacing current policy. Prepared ZIP SHA-256: `22061cb678580fb825108c616a1230e88074d397bf7f4429b236cbb0e71bb4b8`. It remains on the development disk; copying it to independent storage is still a maintainer responsibility.

Retention keeps all protected points, with Git deduplication and no destructive automatic pruning. Caps are 2 MiB per file, 128 MiB per snapshot and 4096 discoverable points. Review growth quarterly. Actions outputs retain for 30 days as secondary copies. The [operations guide](docs/OPERATIONS.md) covers export, rollback, key revocation and prolonged downtime.

## Real GitHub submission scenarios

All scenarios used owner-controlled test data, real GitHub identities/releases and a separate purpose-bound integration signing key/namespace. They never approved the fixture for production.

| Scenario | Hosted result | Behavior verified |
|---|---|---|
| Manifest registration | [43661811854](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43661811854), passed | Actual manifest, owner identity, approval gate, release v1, images/assets, unauthorized bot rejected |
| Automatic manifest update | [43662186641](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43662186641), passed | Changed manifest and release v2 synchronized without new approval |
| Guided registration | [43662805350](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43662805350), passed | Real issue, manifest absent, recovered registry independently confirmed guided source |
| Automatic guided update | [43664370331](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43664370331), passed | Edited owner issue, release v3, guided source asserted, no routine approval, unauthorized bot claim rejected |

Every successful scenario physically deleted its ephemeral Actions state artifact, then restored consistent metadata/images from the durable vault. Covers were 640x360; screenshots 480x320. Current delisting was reapplied after recovery. Final guided asset: 282 bytes, SHA-256 `bb91b7e11c234478b605414b68ddf6e42032783ab4ac7fc670627631a8b11087`, containing only fixture text. The final run also verified actual private-tag force-update denial, public-receipt update/delete denial, production ruleset coverage, and creation/closure of controlled alert issue 18.

GitHub issues used the exact form headings and real parser. Browser clicks through form widgets were not automated: real issue creation/editing used the authenticated CLI. Owner fixture issues 6/7 were closed after verification and remain in the ledger. Actual production issue-event run [43665108215](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43665108215) passed synchronization, backup, receipt, publication and feedback after the manifest fixture issue closed. This validates the event path with the fixture still delisted; eligible fixture publication was tested separately in the isolated driver.

## Tests and independent review

Original 47 regression tests preserved. Windows full suite passed 69/69 after the API cache repair; final artifact-setting test passed separately. Hosted Linux [CI 43664672425](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43664672425) passed **70/70**, no failures or skips. Runtime dependencies remain Ajv/Sharp, YAML test-only. No new runtime dependency was introduced.

New coverage includes real local Git-object snapshots, idempotence, interrupted writes, unanchored state, missing/corrupt newest points, exact older rollback authorization, wrong keys/identities/provenance, traversal, tampering, credential exclusion, immutable commit binding, current-policy reapplication, empty replacement, stale concurrent writers, API outages/stale health, pinned source revisions, actual upload-directory integrity, integration separation and offline-export corruption. Existing suites retain both intake routes, ownership/claims, third parties, trust/revocation, transfers, malicious metadata/images/URLs, absent releases/assets, rate limits and deterministic catalogs/assets.

Local recovery tests use real Git storage with a bounded API emulator. They are not claimed as hosted API-outage or repository-transfer tests. Deterministic fixture catalog, registry and normalized-asset assertions passed; downloaded production catalogs also matched byte-for-byte after recovery.

Zeroshot v16 ran bounded read-only Codex reviews against actual source. Initial review confirmed three publication-integrity defects: moving checkouts, missing final asset-byte comparison, and an immutable flag not bound to the signed commit. Follow-up adversarial review reproduced two notification defects: self-test confusion and competing writers. Repairs added failing-then-passing regressions; closure found no remaining confirmed findings in scope. Later live testing exposed stale read cache after mutation; its narrow repair received independent scoped approval and five operations tests passed in that review.

The reviewers used installed dependencies and did not access credentials, mutate code, merge or deploy. Later passes used `--test-isolation=none` after the default Windows test runner hit `spawn EPERM`. Recovery/full-suite and hosted results were independently executed by the coordinator/CI, not claimed as reviewer execution. No AI dependency or extra installation entered production. Exact run IDs, findings, corrections and limitations: [independent review report](docs/ZEROSHOT-003-REVIEW.md).

## Recorded failed attempts

- `43662731994`: cancelled because the coordinator started guided testing before the fixture manifest-removal push completed; corrected before the successful guided-first test.
- `43663930320`: limited Actions token omitted administrator-only bypass details; fixed visibility handling without broader permissions.
- `43664097698`: test alert remained open because cached pre-write reads were reused; reproduced and repaired.
- `43664463015`: production stopped at candidate upload because hidden staging files were excluded. No backup/publication replaced valid state. Real operations issue 21 opened; the next successful production run closed it automatically. Added the upload setting and a regression.
- `43664806104`: early health drill began before the first production publication completed; correctly failed with no verified publication. Subsequent health passed.

These are not counted as successful tests. The final hidden-artifact workflow setting was coordinator-verified after the last independent source review.

## Remaining limits and human responsibilities

- Production intentionally has no community listings. New untrusted projects, third-party representation, disputes, sensitive attribution/category/game changes, transfers, policy changes and destructive rollback remain human decisions. Approved routine updates are automatic.
- One approving CODEOWNER review protects code/policy. A PR author cannot approve their own PR; owner-authored future changes require another authorized CODEOWNER, added through an independently authored PR reviewed by the current owner. Routine synchronization needs no PR.
- Scheduled workflows are configured and manually verified; natural next-day cron execution and natural retention expiry were not waited out. Artifact unavailability was tested by deletion.
- Complete GitHub outage, actual remote repository deletion/transfer, account takeover and signing-key compromise were not deliberately caused. Relevant failure paths have executable local coverage and documented recovery procedures.
- A second GitHub repository does not protect against complete GitHub/account loss or an administrator deleting both repositories/releases. Copy exports to independent storage. No permanent off-platform service or third-party monitor was installed.
- Account email preferences were not changed. Owner-mention alerts are verified; email delivery and alerts during a full GitHub outage cannot be guaranteed. Notification job concurrency can coalesce pending events, and discovery is bounded to 100 matching issues.
- A short interval exists between final source-head verification and artifact upload; GitHub cannot make those one atomic transaction. Outputs retain signed source provenance. Future consumers must select verified successful publications.
- GitHub hosting and validation do not establish malware safety, authorship, team authority or licensing. Submitted downloads were never executed. Archive contents/ROM absence still require human judgment. Cross-platform encoder equality is not promised.

Previous milestone: [archived self-service verification](docs/VERIFICATION-SELF-SERVICE.md). All operational procedures work with Node/GitHub alone; Codex and Zeroshot are development tools only.


