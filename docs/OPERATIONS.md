# LoG Hub operations : LOG-HUB-003

Current launch guidance: [Cloudflare Pages Free setup](launch/CLOUDFLARE.md), [maintainer moderation checklist](launch/MODERATION-CHECKLIST.md) and [deployment/rollback checklist](launch/DEPLOYMENT.md). Intended URL is https://loghub.pages.dev/ at `/`; GitHub Pages remains disabled and no website is deployed. Backup-health monitors signed catalog publication, not Cloudflare availability; deployment failures require checking the deploy job/Actions notifications and the live URL after authorized uploads.

Source: https://github.com/siruiusamory-cmyk/legacy-of-goku-hub (public).
Recovery vault: https://github.com/siruiusamory-cmyk/legacy-of-goku-hub-backups (private).

No paid plan, CMS, server, frontend or AI service is needed. GitHub Free private repositories do not offer the branch/tag rulesets available on public repositories. The vault therefore uses GitHub's free immutable releases plus signed snapshots, while the public source holds protected, content-free recovery receipts. The backup repository remains private. This arrangement detects loss/tampering; an administrator can still delete repositories or releases, so off-platform exports remain necessary for account/service loss.

## Publishing gate

The workflow stages are synchronize → private backup → protected public receipt → verify/publish. Candidate artifacts are explicitly unprotected work products. Only the final `catalog` artifact is publication. If backup, immutability, receipt or final byte verification fails, publication stops and the previous protected recovery point remains authoritative. The publishing job retains source `contents: read`; only the isolated receipt job has source `contents: write`, and it creates tags rather than changing protected production code. Backup write credentials are scoped to the private vault.

`PUBLISHING_ENABLED` is an administrator Actions variable, enabled only after initial durable recovery, protections and hosted tests pass. Set it to `false` immediately during a publishing incident requiring investigation. `policy/recovery.json` pins both numeric repository identities, source branch and trusted Ed25519 public verification keys. The independent private signing key is an encrypted Actions secret. `policy/publishing.json` remains the only authority for trust, claims, suspensions and delistings; neither backup restoration nor an old public catalog can override it.

## Snapshot format and retention

Each point is a Git commit with `manifest.json` and allowlisted `payload/` files. It contains the registry, approved editorial records, release/ownership state, normalized images and the exact catalog. Raw API caches, policies, workflow files, tokens, environment files and private keys are excluded. Per-file SHA-256, sizes, repository IDs and source-run provenance are signed with Ed25519. File paths, modes, schemas and normalized images are revalidated on restore.

Private tag: `loghub-v1/RUN_ID-SNAPSHOT_SHA256`, locked by an immutable private prerelease. Public receipt: `loghub-anchor-v1/RUN_ID-SNAPSHOT_SHA256-PRIVATE_COMMIT_SHA`, pointing to the public source-code commit. The receipt exposes hashes/references only, not recovery files. Public tag rules prohibit updates and deletion without bypass actors. A failed write before receipt creation is not an accepted recovery point. A repeated identical state reuses its verified point without adding a commit or release.

Retention is **keep all protected recovery points**; no automatic deletion or history rewriting. Git deduplicates unchanged blobs. Storage growth is approximately changed metadata plus newly normalized image versions, rather than a full independent archive each day. Each snapshot is capped at 128 MiB, files at 2 MiB, history at 4096 points; approaching a cap requires a reviewed capacity/export change. Actions artifacts retain convenient secondary outputs for 30 days and are never the sole recovery authority. Review vault size quarterly and after bulk artwork changes. Do not delete historical tags to reclaim space casually.

## Initial setup

The owner created a private GitHub App installed only on the vault, with Contents write and automatic Metadata read. Store its App ID as `BACKUP_APP_ID`, its PEM as `BACKUP_APP_PRIVATE_KEY`, and an independent Ed25519 PKCS#8 PEM as `BACKUP_SIGNING_KEY` in source Actions secrets. Never paste keys into issues, commits or command arguments. Workflows mint short-lived installation tokens reduced to read or write as needed; there is no broad account token in Actions.

Protect source `main` with PR/CI requirements, no force pushes/deletion and administrator enforcement; CODEOWNERS routes changes to the owner. Protect `refs/tags/loghub-anchor-v1/**` against updates/deletion without bypass actors. Enable immutable releases on the private vault; do not make it public. Keep Actions default token permissions read-only. Enable workflow failure notifications for maintainers in GitHub notification settings.

Observed November 15, 2026 after the owner's LOG-HUB-005 change: production protection requires strict `test`, an up-to-date branch, a PR, linear history and administrator enforcement, with force pushes/deletions disabled. Required human approval count is zero and CODEOWNER review is not enforced. CODEOWNERS remains the ownership map; actual human content inspection is still required by the moderation procedure. Do not claim that a second human is enforced by these settings. No protection was changed during LOG-HUB-008. These settings affect code/policy changes, not routine project synchronization.

The backup App is `log-backup-automation`, App ID `5764581`, installed only on the private vault. It has no source-repository installation. The public source's `BACKUP_APP_PRIVATE_KEY`, `BACKUP_SIGNING_KEY` and isolated `INTEGRATION_SIGNING_KEY` are encrypted Actions secrets. Only public verification keys are committed. Do not install an account-wide PAT as a substitute. Source Issues and Actions are enabled, Actions cannot approve PR reviews, and the integration fixture is explicitly delisted by numeric ID.

For a genuinely new empty hub, manually dispatch **Initialize durable recovery (owner only)** with `INITIALIZE NEW EMPTY HUB`. It refuses known previous publications, migration records or replacement of existing state. It creates and verifies an empty baseline recovery point and protected receipt. For an existing hub, use a reviewed saved snapshot and the explicit local initialization command below instead of empty initialization. Only then enable `PUBLISHING_ENABLED` and dispatch the catalog workflow.

## Normal submissions and moderation

Developers use the manifest registration or guided Issue Form described in README.md. The daily workflow and issue changes refresh eligible projects without routine PR merges. New/untrusted sources and sensitive claims/transfers require explicit protected publishing-policy changes. Owners approve exceptions by merging the policy PR after checking numeric IDs and exact submission/metadata digests. Delisting and revocation remain effective after recovery because current policy is reapplied.

## Monitoring

Every failed protected publication is an Actions failure and must not be described as backed up. **Verify backup health** independently runs daily: it checks signed durable recovery plus a successful final publication/verification within 48 hours. Maintainers must subscribe to Actions failure emails; the workflow itself does not send third-party messages. Inspect the failed step and the `validation-report`/protected receipt artifacts. During a complete GitHub/Actions outage the monitor cannot send an alert; retain off-platform exports and monitor GitHub availability through ordinary maintainer practice.

An isolated notification job also opens/reuses a `loghub-operations` issue mentioning the repository owner when backup/publication or health fails. Repeated failures add comments instead of new issues. Only a successful final publication closes it automatically; a cancelled run or an unrelated healthy check cannot clear a publication failure. Operational issue events are excluded from catalog synchronization to avoid alert-triggered retry loops. A controlled hosted alert self-test is explicitly labeled as a test and is closed after verification.

All production notification writers share the same non-cancelling GitHub job-concurrency lock and perform a fresh lookup after acquiring it. Controlled tests use a different issue title and label (`loghub-operations-test`) and can only close their own test issue, never a real incident.

An old immutable recovery commit is healthy when daily unchanged-state verification succeeds. Its creation age alone is not a stale-backup signal. The monitor checks successful verification activity, not unnecessary daily duplicate commits.

## Restore and off-platform export (Windows)

Install Node.js 24 and run `npm.cmd ci --ignore-scripts`. Obtain a short-lived **read-only** vault App token using the owner's approved credential process and expose it as `BACKUP_TOKEN` in the current shell. `GH_TOKEN` is source read-only for restoration. Do not put token values in command arguments, reports or exported files.

```powershell
node src/backup-cli.js export C:\SafeExports\loghub-2026-11-15
Compress-Archive -LiteralPath C:\SafeExports\loghub-2026-11-15 -DestinationPath C:\SafeExports\loghub-2026-11-15.zip
Get-FileHash -Algorithm SHA256 C:\SafeExports\loghub-2026-11-15.zip
```

Copy the ZIP, its external SHA-256, the protected source policy/public verification keys and source code to an offline disk or another storage account. Do not include environment variables, App PEM or signing private key. The export contains a signed recovery envelope and complete metadata/images. Keep at least three independently dated off-platform exports; refresh after material catalog/ownership changes and at least monthly. This is a manual export procedure, not a permanent external service.

Verify an extracted export without GitHub using `node src/backup-cli.js verify-export C:\SafeExports\loghub-2026-11-15`. To make an explicitly selected offline restore, set `OFFLINE_RECOVERY_AUTHORIZED=I_AUTHORIZE_OFFLINE_RESTORE` in the shell and run `node src/backup-cli.js restore-export C:\SafeExports\loghub-2026-11-15 C:\Recovery\fresh-snapshot`. Existing destinations are refused. This restores data for inspection/recommissioning; it does not authorize an online destructive rollback or replace current publishing policy. Keep a working Node/dependency environment or offline package cache with your recovery kit.

An actual read-only App export and offline CLI verification/restore were exercised for the production baseline. A ZIP on the same development disk is only a prepared export: a maintainer must copy it to independently controlled storage to obtain off-platform disaster protection. The export procedure does not run itself or create an external service.

Operational jobs pin the same source commit and refuse candidates when the protected default-branch revision changes. Final verification compares the complete upload directory, including artwork and unexpected-file rejection, to the protected recovery point. Private release validation resolves its locked Git tag and requires the exact signed commit, not merely an immutable flag.

Normal automated restore uses `node src/backup-cli.js restore .previous` in a fresh workspace. It ignores Actions artifact expiry and verifies the newest protected receipt/private snapshot. Local restoration refuses to overwrite an existing directory. After prolonged Actions downtime, restore the durable point, reapply current policy via the normal synchronization, and let backup/receipt verification gate publication again.

If the newest protected point is damaged/missing, `node src/backup-cli.js inspect C:\SafeExports\inspection` may export the newest older valid point for inspection only. Publication is blocked until an administrator PR pins `rollback.point` and `rollback.observed_newest` plus a reason in `policy/recovery.json`. The observed newest receipt must match exactly; the approval cannot authorize arbitrary future rollback. After successful recovery produces a new protected point, remove the temporary rollback authorization through a PR. Never silently reset to an empty registry.

For a deliberate first initialization from an operator-reviewed saved export, set `INITIALIZE_BACKUP=I_AUTHORIZE_INITIAL_RECOVERY_POINT`, supply `GITHUB_RUN_ID` and `SOURCE_COMMIT` identifying the authorized operation, provide `BACKUP_SIGNING_KEY` through a secure environment, and run `node src/backup-cli.js initialize C:\ReviewedSnapshot C:\ReviewedSnapshot\catalog.json`, then `node src/backup-cli.js anchor`. Initialization cannot replace existing protected history. Keep production disabled until both commands verify.

## Compromised credentials

Disable `PUBLISHING_ENABLED` first. Revoke the App private key/installation at GitHub, replace the source App secret and recheck that installation access covers only the private vault. A leaked vault write token cannot forge Ed25519 signatures or rewrite protected public receipts; treat deleted/missing points as an incident, not permission to fall back silently. If the signing key was compromised, revoke that trust key through protected recovery policy, install a new signing secret/public key, and have an administrator select an independently verified recovery point/export. Retain older public verification keys only when they remain trusted; removing a key intentionally makes its snapshots untrusted.

Account takeover or complete GitHub loss affects both repositories. Recover using the off-platform export and independently preserved public verification keys/source policy; a second repository on the same service is not a cross-provider disaster backup.

