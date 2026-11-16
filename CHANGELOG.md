# Changelog

## LOG-HUB-013: private administrator dashboard (activation pending)

- Add an Access-protected, default-off browser inbox, visual normalized-artwork review, public/private notes, history, exact approvals, protected publication PR preparation and verified deployment status.
- Add stable-identity catalog editing, claim evidence, suspend/delist/restore review and expiring/revocable sessions with CSRF protection.
- Load approved metadata for withdrawn managed listings; require restoration before editing a withdrawn legacy catalog record.
- Document the single independent review's three repaired findings and the isolated browser/security verification limits.
- Keep unapproved material in private D1/processor memory, preserve signed publication governance and anonymous public services, and require separate owner authorization for merge and production activation.

## LOG-HUB-012: universal project submissions

- Add a native /submit/ page and /submit/status/ with URL-first fields, Add/Suggest/Correct/Claim actions, duplicate detection, accessible errors, review step and receipt. No account, repository or source code is required.
- Add hub-assigned `ext-` listings for non-GitHub projects with source-aware labels (View Repository, Visit Project, Download Patch), moderated artwork and distributions, and claim/transfer protection. Existing `gh-` IDs and ratings are unchanged.
- Activate the intake Worker, D1 database and Turnstile widget on the free plan, with the public form enabled through repository variables.
- Add a default-off Cloudflare Worker/D1 intake queue with Turnstile, rate limits and hashed receipts, plus a moderator CLI. Extend `.loghub.json` to gitlab.com and codeberg.org. Activation, merge and deployment remain owner decisions.

## LOG-HUB-011: anonymous community ratings preparation

- Add a separate default-off Cloudflare Worker/D1 API with hashed browser-local credentials, atomic 1–7 votes, genuine aggregates, rate limits and fraud exclusions. No sign-in or account is required.
- Connect the existing Dragon Ball controls to anonymous autosave, reload, change and removal behind an explicit activation gate. Preserve the exact preview disclosure when disabled.
- Add focused backend/browser/accessibility checks, privacy guidance and deletion-aware private export/recovery. Production activation remains a separate owner decision; the live static directory and signed publication safeguards remain unchanged.

## Discord community navigation

- Add the owner-provided Hub Discord invite immediately after GitHub in the desktop header and to mobile navigation, with an accessible inline Discord icon. No tracking or dependencies; deployment requires owner approval.

## LOG-HUB-010: Cloudflare Pages launch preparation

- Replace the disabled GitHub Pages target with pinned Cloudflare Pages Direct Upload for loghub.pages.dev at `/`, preserving verified catalog publication and all three approved resources.
- Transfer the exact immutable website artifact with a full output hash inventory, current build/policy binding, strict target check and protected-main/default-off deployment gate. Scope Cloudflare secrets to the deployment environment/job.
- Document Free account/project/credential setup, monitoring and current-policy rollback. No live deployment, paid feature, runtime service, catalog approval or artwork/design change.

## LOG-HUB-009: initial catalog approval

- Record explicit owner approval of three disassembly resources from guided issues #31–#33, binding exact content and ordered source/normalized banner hashes to repository/owner/project identities.
- Preserve fixture delisting and empty trusted-owner list; exclude DragonByte Z. No releases, ratings, deployment, upstream changes or recovery infrastructure changes are introduced.

## LOG-HUB-008: public launch preparation

- Refresh four real candidate repositories and prepare unapproved submission drafts; DragonByte Z still needs current owner-approved cover art.
- Document launch blockers, no-persistent-voting recommendation, maintainer moderation, deployment and emergency rollback procedures, with independent Zeroshot findings.
- Reconcile operational documentation with observed branch protection. Pages, production policy and listing approvals remain unchanged; rating disclosure is isolated in PR #29.

## LOG-HUB-006 (content moderation review candidate)

- Require protected first-content approval and ordered raw/normalized artwork hash approvals for every owner.
- Hold changed artwork without exposing candidate image bytes; retain approved listings.
- Reapply current moderation to recovery/publication/site assets, add private local review tooling, and retire public artwork staging.
- Bound issue intake and add rejected-issue/blocked-submitter policy controls with moderation regression coverage.
- Updated both Issue Forms to explain mandatory review and discourage public image attachments.
- No listings approved, deployment enabled, dependencies added or protection changes.

## LOG-HUB-005 (final review and integration gate)

- Corrected the general frontend guide to describe the current self-hosted fonts and minimal rating selector following independent review. Runtime behavior is unchanged.
- Integration remains gated on required GitHub CODEOWNER approval; no branch protection or deployment setting was changed.

## LOG-HUB-004C (visual identity review candidate)

- Added owner-selected per-game scenery rendered once without tiling, and removed redundant visible rating numbers while preserving accessible labels.
- Refined hero-only scenery, frame hierarchy and integrated featured layout; replaced clipped summaries with complete first sentences and fixed narrow filter widths.
- Added owner-requested Buu's Fury portrait borders, with source/crop integrity coverage and explicit unresolved redistribution status for game assets.

- Added shared gold-edged frames, menu states, a grid rating panel and warm About reading surfaces.
- Added credited LoG II Canyon scenery, following owner authorization, with preserved aspect ratio and integer desktop/mobile scaling.
- Added a shared artwork fallback and regression coverage for missing assets and narrow-card containment.
- Preserved typography, project metadata, artwork restrictions, publishing policy and recovery; no deployment or persistent voting added.

## LOG-HUB-004B (typography review candidate)

- Refined heading tracking and mobile title/panel sizes; modestly enlarged branding with narrow-header regression checks and matching polish screenshots.

- Self-hosted four optimized Latin Barlow Condensed and Inter styles, preserving OFL notices and source hashes.
- Added shared typography tokens, upright section/card headings, selective italic display titles and readable Inter body/control text.
- Captured matching real-preview before/after views and added font loading, integrity and long-title checks.

## LOG-HUB-004A (isolated review candidate)

- Added read-only ingestion and a clearly separated preview for four real owner repositories.
- Kept obsolete DragonByte screenshots out of previews; its neutral placeholder is preview-only and production cover validation remains mandatory.
- Consolidated detail descriptions, badges, release information and links; omitted empty galleries and removed the header/spotlight swoosh CSS.
- Added real-repository and detail-consistency browser coverage; retained protected publishing and approval policy.

## LOG-HUB-003 (operational verification in progress)

- Added signed, content-addressed recovery snapshots in a separate private GitHub repository.
- Added immutable private recovery releases and protected public hash receipts without a paid GitHub plan.
- Split synchronization, backup, receipt creation and publication; unbacked candidates cannot become published catalogs.
- Added integrity checks, explicit rollback authorization, non-destructive restore/export and backup-health monitoring.
- Added eleven recovery tests using real local Git objects alongside the existing 47 regressions.
- Created the public source and private recovery repositories, configured backup-only App credentials and kept production disabled during verification.
- Hosted workflow verification and independent review results will be recorded before enabling production.
- Hosted CI passed and the initial signed immutable recovery point plus protected receipt were created successfully.
- Independent review prompted revision pinning/current-policy guards, complete uploaded-image verification and immutable-tag commit binding, with regression coverage.
- Added isolated live-GitHub fixture scenarios, purpose-separated integration recovery and offline signed-export verification.
- Hosted manifest registration and automatic-update tests passed, with recovery after actual Actions state-artifact deletion.
- Added direct immutable/protected-tag denial probes and deduplicated owner issue alerts for backup/publication failures.
- Hosted guided submission and protection-denial checks passed; cancelled one prematurely sequenced test and reran after verifying the fixture prerequisite.
- Independent review reproduced alert self-test interference and concurrent issue creation; isolated test alerts and serialized all production writers with regressions.

## Self-service milestone

- Added repository manifests, guided forms, numeric-ID claims, explicit trust policy and automatic eligible-project synchronization.
- Retained static catalog generation, GitHub-only releases, image normalization and failure retention.
- Verified 47 local tests and obtained a scoped independent source review.

- Correct limited-token ruleset visibility in the hosted drill; retain explicit bypass rejection and owner-side verification.

- Invalidate GitHub read caches after successful mutations, with a reproduced alert-cleanup regression.

- Include the hidden candidate staging directory in Actions uploads while excluding the raw HTTP cache; real production failure stays fail-closed and opens a maintainer alert.

- Keep the hidden-file setting on the upload action only.

- Complete hosted manifest/guided registration and update verification, production publication, artifact-loss recovery, offline export/restore, alert lifecycle and backup health. Record actual failures and scoped independent review outcomes.

- Record successful issue-event production and feedback verification.

- Clarify the sole-CODEOWNER review boundary for future owner-authored changes.

## LOG-HUB-004

- Implement the approved Astro static homepage, stable project details, responsive layouts and honest empty state.
- Add canonical SVG Dragon Ball star arrangements and accessible, unsaved rating previews; no voting backend.
- Consume signed recovery exports with current delisting, preserve existing catalog/backup stages, and prepare default-off Pages deployment with isolated permissions.
- Add isolated fixtures, 20 browser checks, axe/performance evidence, palette mappings and bounded independent review; retain all existing regressions.
- Keep reference artwork, installed development skills and local previews out of production. No auto merge or public deployment.

- Select preinstalled Chrome for Ubuntu browser CI after the downloaded Chromium sandbox was blocked by AppArmor; retain sandboxing and repository permission boundaries.

- Make screenshot capture deterministic for offscreen lazy media in hosted Chrome; require successful decoding without altering production lazy loading.

- Verify all 73 Node and 20 browser tests on hosted Linux with sandboxing enabled; retain normal PR approval and default-off deployment.

- Restored original detail frame dimensions; remove normalization padding from a detail-only derivative and scale the complete banner to fill the frame interior.

- Preserve banner proportions inside the unchanged detail frame using a logo-focused cover crop, replacing stretched fill sizing.

- Centered the title-logo regions for all three disassembly detail images inside the original unchanged frames. Crop rectangles are pinned to source content hashes so updated artwork cannot receive stale crops.

- Removed rating instructions, preview-status copy and text labels; centered Rate this project on the same desktop centerline as the balls while retaining accessible radio names and nonpersistent interaction.

LOG-HUB-006 independent review correction: last-artwork removal may create an empty protected snapshot only under explicit identity-bound suspension/delisting policy; accidental empty resets remain blocked.

Use the Report project content Issue Form for inappropriate artwork or misleading information. Reports notify maintainers, carry no publication authority and do not automatically hide projects. Supply URLs and text only, not image attachments.

# LOG-HUB-008: rating disclosure

- Label the existing seven-ball selector as an unsaved preview; no public votes or ratings service are implied.


LOG-HUB-011 validation: add atomic fraud-exclusion/appeal triggers and deletion-aware recovery import checks; production voting stays disabled.

LOG-HUB-011 review fixes: prevent early selections during initialization, preserve successful appeals during recovery, and document explicit workers.dev activation.

LOG-HUB-011 final checks: retain original aggregate typography and cover network-wide abuse limits, quota failures and isolated local D1 recovery import; keep autosave actions within the existing selector panel.


LOG-HUB-011 owner UI refinement: remove panel copy and buttons; activating the selected ball by click or keyboard Space removes a vote, with accessible feedback and privacy outside the panel.


LOG-HUB-011 authorized rollout: allocate the isolated ratings database and workers.dev origin; keep backend voting disabled until secret, schema and API checks pass.


## Isolated administrator activation acceptance

Configure separate source/vault identity and signing keys, empty approval policy and isolated processor App repository. Production settings remain unchanged.
