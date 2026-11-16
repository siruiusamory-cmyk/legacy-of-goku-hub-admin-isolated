# LOG-HUB-013 verification and independent review

Production administrator access is disabled. No production administrator settings, D1 migrations, publication listings, protection rules or deployment gates were changed. No fictional project was published remotely.

One bounded independent read-only Zeroshot review: `01a1e35d-9955-7d61-aaec-38f160944a9c`. Original verdict: **FIX BEFORE ACTIVATION**, three demonstrated findings. The coordinator fixed all three; no second review loop or independent post-fix PASS is claimed.

| Finding | Resolution and evidence |
| --- | --- |
| P1: a hosted manifest could approve different artwork/metadata from the displayed submission | The shared listing evaluator optionally captures the exact source image buffers it inspected. Private preparation freezes the resolved record and those same buffers into the displayed package. A regression uses visibly different submitted/hosted artwork, verifies the preview/source hashes against policy and publishes the resolved title through the actual isolated publisher. |
| P2: an anonymous correction racing approval could leave a stale approval recorded | Approval, matching submission state/revision and history now execute in one D1 batch. A conditional review update and SQLite `changes()` guards leave no approval/history when revision changes. The regression injects a correction precisely at the previously vulnerable boundary and asserts HTTP 409. |
| P2: clearing an existing download-link field did not remove it | Explicitly clearing the catalog editor field deletes distribution from the prepared listing. A regression verifies the old distribution is absent. Omitted partial corrections continue preserving existing links. |

The same regression work found/repaired duplicate artwork-set insertion during metadata-only edits. Existing exact artwork approvals are reused rather than violating the policy schema's uniqueness requirement.

Verification includes real Worker handlers/in-memory SQLite, generated RSA Access signatures, real Sharp preparation and normalized previews, proposed PR tree construction, stale/concurrent writes, authorization failures, CSRF, rate limits, session revocation, receipt privacy, hosted-content freezing, stable-ID legacy migration, and actual catalog suspension/restoration/delisting. The deployment-status test distinguishes approval/merged PR from a successful protected deployment. Existing signed-recovery/listing tests remain in the regression set.

Two actual Chromium browser journeys (390 and 1280 CSS pixels) exercise correction requests, revised review, artwork inspection, exact approval, PR initiation and revocation. Both pass automated axe accessibility and horizontal-overflow checks. The mobile screenshot was visually inspected. The administrator Worker passes a Wrangler dry-run with its activation gate false.

Access, GitHub and deployment endpoints in these tests are isolated doubles. Actual email PIN delivery, production environment/credential restrictions, real protected publication from the new dashboard, physical devices and assistive technology remain unverified until separately authorized isolated/live activation. Hosted PR CI runs the complete existing Node and browser checks; a green test result does not activate production access.

The independent reviewer attempted a lockfile-based dependency install despite its read-only scope; it failed with EPERM after disturbing local dependencies. Dependencies were restored from the unchanged lockfile before the focused regressions and browser checks. No reviewer source/configuration edits were made.
