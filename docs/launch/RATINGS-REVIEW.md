# LOG-HUB-011 bounded independent review

Zeroshot run: 01a1e286-0b16-71a0-9aaf-4985d302de62. One read-only review; no production access or AI runtime dependency.

Original verdict: **FAIL**, with two evidence-backed correctness blockers. Both have been fixed and regression-tested by the implementation author. No second independent pass or independent post-fix PASS is claimed.

| Finding | Resolution | Verification |
| --- | --- | --- |
| Enabled controls could accept a selection before asynchronous initialization installed handlers; an own-rating read could later overwrite it. | Activated controls and destructive actions start disabled. Handlers install immediately; controls enable after aggregate and own-rating initialization. Own-rating reads disable input and use a version guard. Preview controls retain their existing behavior. | Actual local Worker/D1 browser test deliberately delays both the initial aggregate and own-rating response, asserts controls are disabled, releases responses, then saves/reloads/changes/removes successfully. |
| Recovery could restore an obsolete exclusion after a successful appeal. | Eligibility now derives solely from the fresh authoritative exclusion ledger. Snapshot exclusion flags are not reused. | New regression exports an excluded vote, supplies the post-appeal empty exclusion ledger, imports into a fresh three-migration database, and verifies count=1,total=7,excluded=0. |
| Advisory: activation instructions omitted workers.dev route enablement. | Checklist now explicitly requires owner authorization before setting workers_dev=true and records the exact allocated origin. Default remains false. | Configuration/document inspection; no public runtime activated. |

The reviewer found no demonstrated cross-credential modification, raw-credential publication, CSRF write bypass, trigger arithmetic defect, or same-credential exclusion bypass within the inspected scope. It confirmed the static Pages workflow changes only pass two default-off build variables; Worker/D1 remain isolated. Accepted browser-reset/proxy abuse is explicitly disclosed.

Reviewer limits: no deployment, external requests, secret inspection, source changes or complete browser rerun. The review independently ran the then-current ten backend tests in memory and reproduced both blockers. Detailed original report follows.

---
Verdict: FAIL - two correctness blockers remain. Production activation remains unauthorized.

Reviewed the working tree against protected baseline f481b6ff765206b0cdfc034383120306ecd22ee7. HEAD advanced externally during this review to cc6b37894258dd61e37a10f4bd0c1fe547b498ee; I reread the affected files, including the new untracked 0003_exclusion_triggers.sql. This verdict covers those inspected contents, not subsequent edits.

BLOCKING

1. Early rating selections are silently discarded.
References: website/src/lib/ratings-client.js:25, :30, :39, :44; website/src/components/RatingSelector.astro:7.
The radio buttons are enabled immediately, but their change handlers are installed only after the initial aggregate request completes. Reproduction: delay GET /projects/gh-N, select 7 while it is pending, then complete the GET. No PUT occurs, and mine() clears the selection. An isolated in-memory DOM reproduction confirmed that the listener was absent during the selection and only GET was requested. Ordinary network latency exposes this failure; the existing browser check waits for networkidle before selecting and misses it.
Fix: keep controls disabled until initialization completes, or install handlers immediately and preserve/queue selections during initialization. Also prevent an outstanding mine() response from overwriting a newer save.

2. Recovery reverses successful fraud appeals.
References: tools/ratings/recover.js:14; ratings/migrations/0003_exclusion_triggers.sql:4; docs/launch/RATINGS.md:47, :67.
Reproduction: export a vote while excluded=1; subsequently approve its appeal by deleting its exclusion row; freeze and export the fresh ledger, whose excluded_credentials array is now empty. Recover the older snapshot using that ledger. Line 14 falls back to the snapshot's excluded=1 and silently excludes the appealed vote again.
Confirmed by importing the generated SQL into an in-memory database with all three migrations: score=7, excluded=1, totals={total:0,count:0}, and zero exclusion records. The appeal trigger cannot correct this because no exclusion row is inserted or deleted for that identity during recovery.
Fix: derive restored eligibility from the authoritative current exclusion ledger, rather than retaining the snapshot's obsolete flag. Add a recovery case covering an appeal after export.

ADVISORY

3. The activation instructions omit enabling the workers.dev route.
References: ratings/wrangler.jsonc:5; docs/launch/RATINGS.md:72–75.
The deliberately disabled template is appropriate. However, the later activation procedure changes the database ID, origins, secret and gates without explicitly changing workers_dev=false or configuring another route. Following those steps literally leaves the documented workers.dev API inaccessible.
Fix: document enabling workers.dev only after the separate owner authorization. Keep the current template disabled.

Verified behavior and boundaries

Inspected ratings/worker.js, wrangler.jsonc, all present migrations, ratings-client, Rating/RatingSelector and their card/page/layout callers, catalog gating, privacy text, export/recover/browser-check tools, ratings tests, workflow changes and RATINGS.md. The catalog workflow differs from baseline only by the two PUBLIC_ build variables. Astro remains static; no Worker/D1 deployment was added to Pages.

Within this scope, I found no demonstrated cross-credential modification, raw-credential publication, CSRF write bypass, aggregate-trigger arithmetic defect, or same-credential exclusion bypass. Credentials are generated from 32 random bytes and hashed server-side. Writes require the configured Origin and bearer credential. Project eligibility is checked against the fetched catalog. redirect:manual plus !response.ok rejects redirects. Database/rate/quota failures return unavailable responses. Recovery now carries unexpired deletion markers forward. Default-off gates, the placeholder database ID and invalid API origin remain intentional safeguards. Accepted identity resets and proxy abuse are not findings.

Evidence and limits

Ran node --test --test-isolation=none tests/ratings.test.js after the migration changes: 10/10 passed, exit 0. These use in-memory SQLite and mocked catalog fetches. The normal test invocation encountered sandbox spawn EPERM; disabling test isolation allowed execution. The two focused reproductions also used memory only.

Inspected .review/011/BROWSER.json: it records actual local Wrangler 4.105.0/workerd/D1 success for all three IDs, save/reload/change/remove, zero Axe violations and unavailable-state handling. I did not rerun that write-producing browser check. The supplied 18-test and default-off build evidence was not independently reproduced in full. Production availability, current provider quotas and deployed configuration were not checked.

No source/settings edits, installations, network requests, agents, credential/private browser inspection or deployment were performed. Dependency installation was blocked by the enforced read-only sandbox. Existing direct dependencies in C:/Users/hears/log-hub-pipeline/node_modules all match package.json pins. Fresh reviewers can use C:/Program Files/nodejs/node.exe (24.16.0) and C:/Users/hears/AppData/Roaming/npm/node_modules/wrangler/bin/wrangler.js (package version 4.105.0). Local verification settings are documented at RATINGS.md:39–43; private salt provisioning and browser/runtime execution remain outside this review.
