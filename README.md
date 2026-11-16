# ISOLATED ADMINISTRATOR ACCEPTANCE ENVIRONMENT

Fictional fixtures only. No production publication or shared signing/backup credentials. Source code mirrors protected production bd411692c750813216028b46c1d823a59d3069b5; configuration points only to isolated resources.

<!-- TODO: add docs/banner.png (900px wide) and social-preview asset -->
# Legacy of Goku Hub

**A community catalog for Legacy of Goku projects, open to everyone.**

Private administrator dashboard: [owner workflow, authentication research and authorization-gated setup](docs/launch/ADMIN.md). LOG-HUB-013 is prepared for review; production administrator access remains disabled.

The listing manager loads approved source metadata even for withdrawn managed listings. Withdrawn legacy listings can be restored through protected review before their catalog metadata is edited.

[Administrator verification and independent review resolutions](docs/launch/ADMIN-REVIEW.md) describe the isolated evidence and remaining activation checks.

![License MIT](https://img.shields.io/badge/license-MIT-blue) ![Platform Claude Code](https://img.shields.io/badge/platform-Claude%20Code-d4a017) ![Submission routes 4](https://img.shields.io/badge/submission%20routes-4-555)

## Contents

- [Submit a project](#submit-a-project-no-account-needed)
- [Legacy of Goku visual identity](#legacy-of-goku-visual-identity)
- [Run locally on Windows](#run-locally-on-windows)
- [Submit without editing hub source](#submit-without-editing-hub-source)
- [Manifest v1](#manifest-v1)

<!-- TODO: add demo GIF of the /submit/ flow -->

## Submit a project (no account needed)

LOG-HUB-012 adds a native **/submit/** page: paste an address, name the project, describe it, review, send. No GitHub account, repository, public source or registration is required, and projects with no repository get a hub-assigned `ext-` ID. Add, Suggest, Correct and Claim are separate actions; a suggestion never grants ownership. Links say what they are: View Repository, Visit Project, Download Patch (approved distributions only). Submissions are live at https://loghub.pages.dev/submit/ behind a human check and moderator review. Details: [submissions guide](docs/launch/SUBMISSIONS.md).

The site is live on **Cloudflare Pages Free** at **https://loghub.pages.dev/** (project `loghub`, base `/`). Protected GitHub Actions publishes signed, moderated static artifacts. See [Cloudflare configuration](docs/launch/CLOUDFLARE.md) and [deployment/rollback procedures](docs/launch/DEPLOYMENT.md). No paid services or custom domain are required.

Anonymous seven-Dragon-Ball ratings are live through a separate Cloudflare Worker and D1 database. Ratings require no visitor account; see [ratings operations](docs/launch/RATINGS.md).

LOG-HUB-005 integrated the reviewed frontend into main. LOG-HUB-006 adds mandatory exact-content artwork moderation; see [the moderation guide](docs/moderation.md).

LOG-HUB-003 provides signed durable recovery in the private backup repository, immutable releases, and protected public hash receipts. The public source is [legacy-of-goku-hub](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub). See [operations](docs/OPERATIONS.md) for setup, monitoring, recovery and off-platform export, and [verification](VERIFICATION.md) for measured hosted results. All configured features use GitHub Free.

Project submissions are accepted through the live anonymous website form, optional guided GitHub issues, or supported repository manifests. Moderators approve exact content and artwork before protected GitHub Actions publishes the signed static Astro catalog. Cloudflare Workers and D1 run the separate submissions and anonymous-ratings APIs. No conventional CMS or paid hosting is used.

The existing Node 24, JSON Schema, GitHub release, Sharp image and deterministic catalog components remain in use. Legacy CLI tools and their regression tests are retained for migration, not the routine publishing path. [LOG-HUB-009](docs/catalog/LOG-HUB-009.md) records owner approval of the three initial disassembly resources and their exact banner/content hashes. Signed workflow artifacts remain authoritative for publication status. Policy explicitly delists the isolated integration fixture; test data never becomes a community listing.

Current operations: [submission moderation](docs/launch/SUBMISSIONS.md), [moderation checklist](docs/launch/MODERATION-CHECKLIST.md), [deployment/rollback](docs/launch/DEPLOYMENT.md) and [signed recovery](docs/OPERATIONS.md). The three approved disassembly resources remain the only public catalog entries; DragonByte Z remains excluded. Historical milestone reports below describe their state at the time.

## Legacy of Goku visual identity

LOG-HUB-004C adds shared gold-edged menu framing, an authentic LoG II canyon backdrop at crisp native/mobile and 2x/desktop scale, compact featured-project presentation, and a reusable unavailable-artwork state. [Visual identity report and matching before/after evidence](docs/frontend/visual-identity/README.md) cover art credits, scaling, tokens, accessibility, performance and review boundaries. The final refinement confines game-specific Kame House, Goku's House and Snake Way scenery to the hero, uses Buu's Fury portrait framing for featured content, quiets secondary borders, preserves complete-sentence summaries and fixes narrow filters. See the [refinement report](docs/frontend/visual-identity/REFINEMENT.md) for provenance limits and independent review. The frontend PRs are integrated into main; this report documents the pre-launch design review.

## Typography review

LOG-HUB-004B self-hosts Latin Barlow Condensed 700 upright/italic and Inter 400/600 WOFF2 styles with SIL OFL licenses. Final polish modestly enlarges the wordmark and opens heading spacing, with additional 320px/390px evidence. It preserves the real-repository preview and detail cleanup. [Typography tokens, licensing and matching before/after screenshots](docs/frontend/typography/README.md) are available for owner review; no typography approval or deployment is implied.

## Isolated real-repository preview and detail cleanup

LOG-HUB-004A adds a separately marked preview of the four owner repositories without approving them. Detail pages display the description once in About, identity badges once in the hero, release metadata in Project Details, and only distinct additional links. Empty galleries and release panels are omitted. Both decorative orange swooshes have been removed. Ratings remain an unsaved interaction preview.

See [real-repository verification and screenshots](docs/frontend/real-repositories/README.md) for the exact inspected revisions, artwork constraint, local commands and approval boundaries. Production policies, signed recovery and deployment gates are unchanged.

## Run locally on Windows

Install Node.js 24 LTS and Git, then use PowerShell:

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run validate
npm.cmd run build
Get-Content dist\catalog.json
```

The last two commands validate/build Git-backed migration records offline. To exercise the current self-service publisher against a configured hub's public issue ledger:

```powershell
$env:GITHUB_REPOSITORY = 'YOUR-ORG/YOUR-HUB'
# Optional GH_TOKEN: read-only contents/issues access for public metadata.
# Restore the signed durable vault first using the read-only credentials in docs/OPERATIONS.md:
node src/backup-cli.js restore .previous
$env:SNAPSHOT_DIR = '.previous'
npm.cmd run publish:local
Get-Content .generated\report.json
Get-Content .generated\work\dist\catalog.json
```

Unset `SNAPSHOT_DIR` only for a genuine first publication with no previous catalog, or a deliberate administrator-managed recovery. Local commands do not download previous artifacts automatically, comment on issues, write Git branches or publish a website. Runtime dependencies remain Ajv and Sharp; YAML is test-only. Keep npm optional dependencies enabled for Sharp's platform binaries.

## Submit without editing hub source

**Method A : repository manifest:** put `.loghub.json` at the root of your public repository's default branch, then open **Register repository manifest** and supply the repository URL. Anyone may point to a manifest; the person submitting its URL does not gain edit authority. After approval, the file is read daily. Approved metadata synchronizes automatically; new or changed artwork is held until its exact bytes are approved. Every first listing needs explicit content review, including trusted owners.

**Method B : guided form:** open **Submit, update or claim a project**. Fill individual inputs and dropdowns, without JSON or fenced code. Select the base game, category and status, provide a title, attribution, description and image paths. The bot reads releases from GitHub. Submit from the repository owner's account, or an explicitly approved representative's account. Third-party suggestions can be reviewed but never grant control of an existing listing.

Keep the generated `###` field headings when editing an issue. Editing or closing/reopening it starts another synchronization; the last approved guided issue is retrieved directly even when closed. Intake scans at most the newest 200 open issues, so resolve spam promptly. Duplicate repository URLs, aliases and claims coalesce by numeric repository ID, not by user-supplied project identifiers. The public ID is generated as `gh-REPOSITORY_ID`; a migrated listing keeps its previous approved ID.

Validation feedback appears in the issue and in the Actions `validation-report` artifact. A review outcome identifies the reason and submission digest where relevant. Fix mechanical errors by editing the issue or manifest. Review decisions go through administrator policy, not a self-declared checkbox or bot-applied label. The artifact is the publication for this milestone; no site is deployed. Both Issue Forms explain mandatory review and ask submitters not to embed unapproved images.

## Manifest v1

The machine contract is [schema/manifest.schema.json](schema/manifest.schema.json). An example with replaceable values is in [examples/.loghub.json](examples/.loghub.json). `schema_version` must be `1`; unknown properties and future versions are rejected.

| Field | Rule |
|---|---|
| `title` | Required, 1–100 characters |
| `developer` | Required attribution, 1–100 characters; does not establish team authority |
| `description` | Required, 20–2000 characters of trimmed plain text |
| `game` | `legacy-of-goku`, `legacy-of-goku-2`, `buus-fury`, `multiple` |
| `category` | `rom-hack`, `fan-project`, `tool`, `resource` |
| `status` | `in-development`, `released`, `on-hold`, `discontinued` |
| `cover` | Required repository-relative image path or immutable raw URL |
| `screenshots` | Optional, up to 6 unique paths/URLs |
| `asset_name` | Optional exact distribution filename; required if latest release has multiple supported assets |
| `links` | Optional, up to 6 `{label, url}` project/community links |

Do not add repository identity, owner IDs, trust flags, project IDs, featured flags, release versions, download URLs, checksums or sizes. GitHub and administrator policy supply them. A manifest cannot approve itself or override a moderation hold.

The reader resolves the default-branch commit once and reads `.loghub.json` at that SHA, capped at 16 KiB, with strict UTF-8/JSON decoding. Relative image paths are pinned to the same commit. Paths cannot be absolute, contain empty/traversal segments, spaces, backslashes or escapes. Raw image URLs must be on `raw.githubusercontent.com`, inside the same canonical repository and pinned to a full 40-character SHA. No raw-image redirects are followed.

Optional project links are HTTPS pages on `github.com`, a `*.github.io` project site, `discord.gg`, `discord.com`, `youtube.com` or `www.youtube.com`. No credentials, custom ports, fragments, direct software/game-file links or arbitrary hosts. These links are emitted as metadata, never fetched. Downloads still come exclusively from GitHub Releases. Extending the host allowlist is a reviewed code/policy change.

## Ownership, trust and approval

[policy/publishing.json](policy/publishing.json) is the administrator-controlled authority. Numeric repository and owner IDs establish repository control, not authority to represent a team. Trust never replaces first-content approval or exact artwork-set approval. Labels, issue edits and manifests cannot approve content.

Follow [docs/moderation.md](docs/moderation.md) for private local review, exact policy fields, protected policy PRs, rejected submissions, holds, suspension, delisting, recovery and spam limits. The old public artwork-staging workflow is retired. Do not commit or upload unapproved images.

## Validation retained from the first milestone

All routes use the same editorial validator, image normalization, GitHub API client, release selector and catalog generator.

- Images: static PNG/JPEG/WebP, 5 MiB maximum, 20 MP maximum, 8192px maximum per side; signatures, corrupt/truncated data and animation are checked. Cover output is 640×360; screenshots 480×320. Letterboxing preserves the full aspect ratio; EXIF rotation is applied, metadata stripped and WebP optimized. Output names remain `assets/PROJECT_ID/cover.webp` and `screenshot-N.webp`.
- Releases: GitHub's latest stable release only; no drafts/prereleases or generated source archives. Supported assets: `.zip`, `.7z`, `.tar.gz`, `.ips`, `.bps`, `.ups`, `.xdelta`, `.exe`, `.msi`, `.dmg`, `.AppImage`. No ambiguity: select an exact filename if needed. Unreleased listings have `release: null`.
- File sizes, download links, version and publication dates come from GitHub. SHA-256 comes from GitHub's native asset digest, or is `null`; arbitrary release text/checksum sidecars are not interpreted. `last_updated` derives from GitHub dates, not the build clock.
- Downloads are never fetched or executed. HEAD checks follow only a bounded GitHub CDN allowlist. No `.gba`, `.gb`, `.gbc`, `.nds`, `.rom`, `.bin` distribution files; archives are not opened. Moderators remain responsible for verifying that a patch archive does not contain copyrighted ROM data.
- HTTP timeouts, byte/pixel limits, safe endpoints, bounded pagination, conditional-request support and conservative failure retention remain. No submitted repository is cloned or executed.
- The catalog is deterministic for identical snapshots and locked dependencies on the same platform. Projects sort by stable ID; title/release/update sort indexes and game/category/status filters remain available. Images are committed/copied normalized bytes; encoder equivalence across platform/library versions is not promised.

The generated contract remains [schema/catalog.schema.json](schema/catalog.schema.json), with optional ownership and project links added compatibly. Future consumers must render strings as text, not HTML.

## GitHub setup and publishing

The public source, private recovery vault, Issues, CODEOWNERS, protected source receipts and narrowly scoped backup App are configured. The [maintainer guide](docs/OPERATIONS.md) describes the exact authority and recovery boundaries. Source policy changes use protected PRs and the required `test` check. Default Actions token permissions are read-only; only the receipt job receives source contents write.

One serialized publishing workflow runs on submission issue changes, default-branch merges, a daily 07:23 UTC schedule, and manual dispatch. It restores signed durable state, reapplies current administrator policy, synchronizes eligible repositories and builds a candidate. Only after a verified private immutable snapshot and protected public receipt exist does final verification permit publication. A backup failure retains the previous verified point and blocks publication.

Published secondary artifacts retain for 30 days:

- **catalog**: JSON and normalized assets for future site consumption.
- **catalog-state**: convenient snapshot; durable recovery does not depend on its retention.
- **validation-report**: actionable submission/review/retained reasons.
- **protected-backup-receipt**: the verified private point reference.

Raw HTTP caches and administrator policy are excluded from recovery snapshots. GitHub-only bounded conditional requests remain available within a run. Restored policy is always the current protected source policy. Missing/corrupted newest recovery points block normal publication pending exact administrator rollback approval.

A daily health workflow checks signed recovery and a successful publication within 48 hours; failures create an owner-mention operations issue. GitHub Actions concurrency may coalesce pending runs, so individual notification delivery is not a guaranteed external monitoring service. No monitor can run during a complete GitHub outage.

Artifacts require GitHub download access and are not a public website endpoint. There is no frontend deployment, daily update PR, runtime AI agent or persistent server. The input ledger is capped at 1000 issues and fails explicitly at capacity.

## Migration and verification

Legacy approved Git records can seed the new publisher after an explicit numeric repository/owner policy approval. They are not silently treated as verified claims. Prefer moving them to repository manifests or guided sources. The legacy JSON form is archived outside the active Issue Template directory; its parser and tests remain. Manual legacy validation, staging/approval PR and snapshot-PR workflows are retained only for exceptional migration. Their old setup instructions are archived in [docs/LEGACY.md](docs/LEGACY.md), not the current publishing contract.

`npm test` includes the original regression coverage plus both new submission routes, root manifest restrictions, identity/claim authority, third-party approval binding, automatic maintenance, transfers, disputes, trust revocation, suspension/delisting, snapshot provenance, failure recovery and deterministic catalogs. See [VERIFICATION.md](VERIFICATION.md) for measured results and limits.

Recomp.fyi research and explicit differences are recorded in [docs/RECOMP-RESEARCH.md](docs/RECOMP-RESEARCH.md). Zeroshot is optional development-time verification only, documented in [docs/ZEROSHOT-REVIEW.md](docs/ZEROSHOT-REVIEW.md). The finished publisher works without Codex, Zeroshot or any AI account.


The candidate upload explicitly includes its hidden staging directory; download steps use normal artifact inputs.

LOG-HUB-003 hosted publication and recovery have passed. See VERIFICATION.md for exact run links, test counts, review findings and remaining operational responsibilities.

Actual issue-event processing and feedback passed in production with the isolated fixture excluded.

CODEOWNERS routes responsibility to the owner. Live protection requires PRs and strict test checks; human approval count is zero and CODEOWNER review is not enforced. Human content review remains mandatory procedure.

## Approved website design (LOG-HUB-004)

The Astro implementation, honest empty state, stable project pages, responsive directory and accurate seven-Dragon-Ball preview are ready for normal PR review. Persistent voting and public deployment remain disabled. See [the frontend report and Windows guide](docs/frontend/README.md), [rendered screenshots](docs/frontend/evidence/empty-desktop.png), [skill investigation](docs/frontend/SKILLS.md) and [independent review](docs/frontend/REVIEW.md). The site consumes signed recovery exports and never substitutes synthetic fixtures for approved projects.

Frontend CI uses the hosted runner's installed Chrome with sandboxing enabled; local Windows checks use project-local Chromium. Visual captures explicitly load and decode lazy images before inspecting them.

[PR #24](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/pull/24) has passing hosted Node and browser checks. PRs #24–#27 and moderation #28 are merged; public deployment and real listing approvals remain pending.

Detail artwork uses a padding-trimmed display derivative scaled proportionally to cover the original fixed portrait frame. Catalog covers and cards remain unchanged.

All three disassembly detail images use source-hash-pinned logo crops, centered within the original unchanged frames.

The rating selector shows only its heading and Dragon Balls. Accessible numeric names remain on the radio controls; selections remain local and reset on navigation.

LOG-HUB-006 independent review correction: last-artwork removal may create an empty protected snapshot only under explicit identity-bound suspension/delisting policy; accidental empty resets remain blocked.

Use the Report project content Issue Form for inappropriate artwork or misleading information. Reports notify maintainers, carry no publication authority and do not automatically hide projects. Supply URLs and text only, not image attachments.

LOG-HUB-011 anonymous ratings implementation and its separate activation gate: [ratings operations](docs/launch/RATINGS.md). The live interface remains preview-only until explicitly authorized.

Anonymous ratings checks and activation limits are recorded in [ratings verification](docs/launch/RATINGS-VERIFICATION.md); the runtime remains isolated from signed static publication.

The [bounded ratings review](docs/launch/RATINGS-REVIEW.md) records the independent findings and their regression-tested fixes; no production ratings activation has occurred.

Ratings verification also covers network-wide anonymous abuse limits, oversized input and database quota failures; existing community-average typography is retained, with autosave feedback and removal controls inside the existing selector panel.


The ratings panel uses only the two labels and Dragon Ball rows; activate the selected ball again by click or keyboard Space to remove your vote. Privacy details are linked outside the panel.

Community: [Legacy of Goku Fan Server](https://discord.gg/P8qC69G3sU), using the owner-supplied Hub invite. Server administrators can inspect that code under Server Settings > Invites. Public validation confirms no expiry; unlimited-use configuration requires administrator confirmation. Discord icon: [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/discord.svg), CC0; Discord is a trademark of Discord Inc.

Owner-authorized ratings rollout uses a separate Free Worker/D1 service; the source runtime remains default-off, and the protected website workflow retains artifact verification.

