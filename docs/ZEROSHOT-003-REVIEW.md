# LOG-HUB-003 independent verification

Zeroshot v16 used its existing single-worker graph adapted to return a typed `report` string, with Codex/OpenAI as a read-only reviewer. Each bounded pass used a separate local state directory. No implementation swarm, automatic repair loop, merge or deployment ran. Apps/plugins and unrelated optional MCP providers were disabled per review run. No new installation, application dependency or global provider change was required for this milestone.

| Pass | Run | Actual outcome |
|---|---|---|
| Recovery/publication source review | `01a1dcaf-ffd2-7a42-9707-bada6ea54432` | Three confirmed integrity findings |
| Adversarial operational follow-up | `01a1dccd-674c-7e93-aed4-3ff0c650aef0` | Prior integrity repairs accepted; two reproduced notification defects |
| Bounded repair closure | `01a1dcd7-052d-79b0-9e95-1393bf51fef5` | No remaining confirmed findings in that scope; three operations tests passed |
| Live-test cache repair follow-up | `01a1dcde-39ed-7491-9063-b1d7f1471c16` | Scoped approval; five operations tests passed |

Confirmed findings and narrow repairs:

1. Moving branch checkouts could diverge from signed source provenance. Operational jobs now pin `github.sha`; `assertSourceRevision` rejects a changed protected branch before candidate operations and again at final verification. The regression covers a moderation-policy merge invalidating a candidate.
2. Final verification did not compare the actual uploaded artwork directory. `verifyPublicationFiles` now rejects changed, missing and extra catalog/image files. The regression exercises all three cases.
3. An immutable release flag alone did not bind the exact signed private commit. Release verification now resolves its tag and requires that commit. A forged-lock regression reproduces the old gap.
4. An alert self-test could close a real incident. Tests now use a distinct title/label and explicit self-test cleanup. A regression keeps an existing real incident open.
5. Independent health/publication notification writers could both create an incident. Both production jobs now acquire the same non-cancelling job-concurrency lock before lookup. A workflow regression checks both callers.

Coordinator-hosted testing subsequently found a stale conditional issue-list cache after a successful API write. `GitHub.request` now clears read cache after successful mutations. The new test failed with the observed open-versus-closed outcome before repair and passed afterward. The last independent pass inspected actual callers and approved this change.

Two GitHub platform integration corrections were also required: limited Actions tokens omit administrator-only bypass details, and hidden candidate staging files require the artifact upload option. The first is covered by a test rejecting explicit bypass actors and separate authenticated owner verification. The second is covered by a workflow regression and the actual production workflow. Neither justified granting broader credentials. The final hidden-artifact setting was coordinator-verified after the last independent source pass.

These are scoped reviews, not certification. The first pass did not run tests. Later passes ran the operations tests using `--test-isolation=none` because the default reviewer subprocess runner hit Windows `spawn EPERM`. Recovery/full-suite and hosted tests were run separately by the coordinator and GitHub CI. The independent reviewers did not access credentials or reproduce remote results. Existing dependencies were available; no reviewer claimed a fresh installation.

Residual limits include the small interval between final source-head verification and artifact upload, GitHub job-concurrency coalescing of pending notifications, manual callers outside the notification lock, and bounded discovery of the first 100 matching operations issues. A complete GitHub outage prevents both hosted automation and hosted alerts. None of these permits restored state to override current administrator policy.

The application, backup CLI and GitHub workflows require no AI service or Zeroshot installation.
