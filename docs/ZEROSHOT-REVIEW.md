# Zeroshot development-time verification

Date: 2026-11-14 local time. No Zeroshot code, SDK, package, service or provider credentials were added to production dependencies or GitHub Actions.

## Availability and configuration inspected

- Installed native Zeroshot **16.0.0**, invoked through the existing npm installation; CLI/version/template validation work.
- Existing native **Codex 0.169.0** and **Claude Code 2.1.325** installations were found. Local runtime configurations in the previous evaluation include **Codex/OpenAI** and **Claude/Anthropic** lanes. No reusable Zeroshot profiles were registered (`profile list` returned an empty list).
- Existing configurations support Codex as the implementation worker and separate acceptance/code-review agents with deterministic script gates and bounded repair. Those implementation graphs were inspected, not run again.
- Built-in templates include `single-worker`, `software-change`, `issue-review`, `pr-review` and specialist `code-review`. The latter review templates are oriented to forge issues/PR delivery. This uncommitted, unpublished local repository has no remote PR, so the existing **single-worker** template was used with a read-only reviewer runtime and **delivery none**.
- Actual verification used the existing configured Codex model `gpt-6.1-sol`, medium effort, read-only sandbox, checkpoints disabled, repository/graph Active Memory writes disabled and no postmortem agent. Claude authentication was not tested; earlier evaluation evidence recorded an authentication failure, so no assumption of current Claude availability was made.
- No installation, credential copy, external message, push, PR, merge or deployment was performed. Task-local inputs/runtime/logs are ignored under `.review/`. Zeroshot state is outside the source workspace under task-local user-home directories. A later explicit user request authorized the MCP cleanup described below; there were no other global configuration changes.

## What actually ran

| Responsibility | Zeroshot run ID | Result and evidence limit |
|---|---|---|
| Independent ownership/security source review | `01a1dc7b-ea94-7ae0-a5a1-3a0cfcc8739d` | Finished; final source review reported two defects with actual code references and triggering cases. Did not execute tests. |
| Independent adversarial source examination | `01a1dc7c-401a-7e90-9c31-67ad4b6304ac` | Inspected requested implementation; reported the unauthorized-pointer case and possible guided-source rollback. No executable probes. Provider teardown failed after the completed turn; the graph nevertheless reported success. Not a clean successful testing run. |
| Bounded repair re-review | `01a1dc82-7560-7611-91f0-48f614230d25` | Logs show inspection of repaired code and tests, but final structured output was null with no usable final verdict; provider teardown again failed. Graph success is not treated as independent approval. |
| MCP cleanup smoke test | `01a1dc89-d8f1-7771-996f-c232ccde6a4a` | Completed; localhost Blockbench errors no longer appeared. A generic completed-turn process-exit diagnostic remained. This was a tool lifecycle test, not a correctness review. |
| Typed final source review, scoped MCP runtime | `01a1dc8b-780a-77f1-8c65-6d9dddac173b` | Completed with an explicit report: **no remaining confirmed findings in reviewed changes**. Zero error-level log records. Inspected all four repairs and authority/recovery/workflow boundaries; executable testing remained coordinator-only. |

Each run used one worker attempt, no implementation agent and no autonomous repair loop. The coordinator limited repairs to two local rounds. Concurrent submissions sharing one local state directory hit a controller-lease error twice; separate per-run state directories allowed the independent passes to launch. This changed task-local invocation only, not global configuration.

The source reviewers declined target-code execution because their inherited security controls required isolation not provided by the read-only review environment. Dependency presence/version inspection succeeded; independent runtime testing did not. Coordinator-run tests are identified separately below and in VERIFICATION.md. Missing localhost MCP transport during teardown is a development-tool problem, not an application runtime dependency.

## Authorized MCP cleanup and corrected interpretation

The user separately asked to address teardown and explicitly authorized removing both the unused Blockbench MCP entry and the exposed ElevenLabs credential. The global Codex TOML was minimally edited: Blockbench removed, ElevenLabs key removed and its credential-less MCP entry disabled. Parsing and Codex's server listing were verified. No provider-side key revocation was performed; the user must revoke/rotate it at ElevenLabs. Diagnostic output had accidentally included that credential during the investigation; it is not repeated or stored in this report. Task-local diagnostics were checked for the exact credential without printing it and none contained it.

Blockbench's configured `localhost:3000/bb-mcp` endpoint was measured as connection-refused. After removal, that specific error disappeared from the smoke logs. A generic process-exit-1 diagnostic persisted. Existing source at `zeroshot/src/harnesses/adapters/core/codex/process.rs` and earlier local evaluation establish that completed Codex output is preserved and this late-exit error is diagnostic; no engine patch or grace-period change was justified.

Correction to the initial interpretation: the built-in single-worker graph explicitly has null output. Thus the missing typed final review was also a report-contract problem, not evidence that MCP teardown lost a completed verdict. A final development-only graph adapts that existing template to require one string report and disables unrelated desktop MCPs in per-run settings while retaining Adja. It has one worker attempt, no repairs, no deployment/delivery nodes and no application/runtime integration. The final run returned the required report and had zero error-level records; both output and logs were checked. This verifies the scoped review setup, without claiming that one isolated configuration change caused every prior generic exit diagnostic.

The exact final source-review text is saved in [ZEROSHOT-FINAL-REVIEW.md](ZEROSHOT-FINAL-REVIEW.md). It explicitly distinguishes source verification from unrun independent runtime tests. Agent references to a committed lockfile are its setup wording; this local new repository remains uncommitted/unpublished, and the coordinator's clean-install evidence is from the existing project lockfile.

## Confirmed findings and repairs

**1. Unauthorized manifest pointer could freeze a guided listing.** The missing-manifest safeguard considered all issue authors. A stranger could submit a manifest registration for an approved guided-only repository and block legitimate owner updates, including after closing the stranger's issue. The safeguard now considers authorized candidate requests, while still retaining claims for previously manifest-backed listings. Regression: `unauthorized manifest pointer cannot freeze an approved guided owner update`.

**2. Feedback failure could discard a complete publication from recovery.** Snapshot selection previously required whole-workflow success, even though catalog/state uploaded before the separate comment job. A failed comment made a later run restore an older snapshot. Selection now requires a successful **publisher job**, trusted run provenance and both complete catalog/state artifacts. Failed/interrupted publishers are skipped; missing/expired artifacts from a known successful publisher fail closed. Regressions: `feedback failure cannot make restoration skip an already successful publisher job` and `interrupted publishers with partial artifacts never replace the prior complete snapshot`.

**3. Deleting the newest guided issue could roll metadata backward.** The adversarial source pass identified this lifecycle case; the coordinator confirmed it with a failing test. Guided synchronization now refuses to select an older issue than the published source watermark and retains the last valid metadata. Regression: `missing newest guided source must not roll metadata back to an older issue`.

The coordinator added all three defect reproductions first and observed **three failures**, then applied narrow fixes and observed them pass. The interrupted-upload regression also passes.

**4. Legacy migration outage could create an unreadable recovery snapshot.** Found by coordinator inspection after the re-review, not attributed to an independent reviewer. A v1 snapshot lacks numeric owner ID; retaining it during an API outage produced an identity mismatch on the next restore. A failing regression reproduced this. Explicit administrator migration policy now supplies the missing binding, rejects conflicting existing owner IDs and leaves normal live-owner verification in place before updates. Regression: `approved legacy migration retains a valid ownership-bound snapshot during an API outage` passed after repair.

No repository-write escalation or arbitrary listing takeover was reported in the reviewed paths. The final typed source review inspected the migration repair and found no remaining confirmed defects in the reviewed changes. This is a scoped independent source verdict, not a comprehensive security certification or independently executed test suite. Repairs remained bounded to two coordinator rounds; there was no repeated implementation workflow or autonomous production action.

## Remaining verification boundaries

Actual GitHub-hosted issue ingestion, comments, scheduler, artifact restore/upload, production branch protection and a real community-approved repository still require a configured remote. No such repository was created or changed. The publisher remains usable with Node/GitHub Actions alone; removing every local Zeroshot file and account does not change its production behavior.
