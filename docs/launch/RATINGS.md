# Anonymous community ratings (LOG-HUB-011)

Owner's anonymous-voting decision supersedes the earlier GitHub-auth proposal and LOG-HUB-008 recommendation. No OAuth, sign-in, account, email or identity-provider credentials are needed. Production activation required a separate owner decision. The owner authorized merge and deployment after the simplified panel was verified; the operations below remain mandatory.

## Design and boundaries

The existing seven-ball selector automatically PUTs an integer 1-7. The detail panel shows only Community Rating and Your Rating with two Dragon Ball rows. Selecting the already-saved ball again removes the vote (including keyboard Space); feedback and exact average/count remain accessible to screen readers and on hover. Privacy information is linked from the footer, outside the panel. A browser generates 32 random bytes with Web Crypto, base64url encodes them, and saves the credential in localStorage on the static site's origin. A Web Lock prevents first-vote identity races between tabs. The credential travels only as an Authorization bearer header over HTTPS, never in URLs, public responses, cookies or analytics. D1 stores its SHA-256 hash; `(project_id, credential_hash)` is the primary key. Clearing browser data or changing browsers can lose vote control and create another identity. This is one vote per browser credential, NOT per human. Shared credentials confer shared vote authority. Browser storage, Web Crypto and Web Locks must be supported/enabled; unsupported storage fails without a saved-vote claim.

A separate Worker serves JSON only on its own workers.dev origin. Exact-origin CORS and Origin checks protect writes; no credentialed cookies or third-party-cookie dependency exists. A bearer credential is required to inspect/change/remove that identity's vote. Public aggregate requests return only count and average. The API fetches the current published site's catalog with redirects rejected before every project operation; only available approved published gh-numeric IDs are accepted. Catalog failure rejects requests. Removed projects disappear from the API immediately on the next fetched catalog, and a ten-minute cron purges their rows. Short source-publication/network races cannot provide atomic cross-service moderation. Stop the API if immediate withdrawal is required.

Static Pages builds and uploads retain their signed recovery/current-policy/same-run immutable-artifact checks; no Worker/Function/database binding enters that artifact. Worker code/config/migrations are separate and never uploaded by the Pages workflow. The catalog workflow only passes two default-off PUBLIC_ variables for a later explicitly authorized UI activation. Worker observability is off. Production provisioning is separate from static publication and requires the recorded owner authorization; no paid plan or feature is selected.

## Schema and API

Apply ordered D1 migrations under ratings/migrations. v1 contains votes, fraud exclusions, constant-time aggregate totals and rate counters; v2 adds seven-day deletion markers for recovery; v3 makes fraud exclusion and appeal single-statement atomic operations. Atomic upsert plus database triggers maintain eligible sums/counts with score/uniqueness checks even under concurrent requests. Last committed write wins for simultaneous tabs. Display rounds `sum / count` to one decimal, never stored averages. Zero rows means null average and Not rated yet. Excluded rows do not contribute. Service/quota errors mean Ratings unavailable, never zero; failed autosaves roll the selection back to its last confirmed value. A lost response can leave a committed write; reload reconciles the authoritative value.

- GET /projects/gh-N: public count/average.
- GET /projects/gh-N/mine: credential's current score/excluded flag and aggregate.
- PUT /projects/gh-N/mine: JSON {"score":1..7}; automatically saves/replaces.
- DELETE /projects/gh-N/mine: removes this credential's vote.
- DELETE /identity: removes all votes made with this credential. It retains no profile/account. The browser can vote again with the same credential.

No credential is issued by the server and no raw credential is stored there. Only the caller can read their own score; no voter listing endpoint exists. Privacy disclosure: /ratings-privacy/. Deleting a vote writes a hashed deletion marker for seven days. Exclusion records contain a credential hash and brief abuse reason only; remove obsolete incident records when appropriate. No invasive fingerprinting or raw IP persistence.

## Abuse controls and free limits

Fixed one-minute windows allow 120 API requests per salted network identity, 30 mutations per network identity, and 15 project mutations per credential. Counters expire after two minutes and cron cleans them every ten minutes. These are globally D1-serialized counters, not isolate-local counters. Shared networks can share a limit; the site explains retry. Request JSON is capped at 1 KiB. Rate/quota/database errors fail closed. IPv6 rotation, proxies, fresh credentials and direct scripted requests can evade anonymous controls; CORS is not bot authentication. Turnstile is deferred until measured abuse justifies the friction and extra dependency. Under sustained abuse disable the API, retain the static directory, investigate, and propose Turnstile separately; never upgrade automatically.

Cloudflare Workers Free currently provides 100,000 requests/day with a 10 ms CPU budget per invocation. D1 Free includes 5M rows read/day, 100K rows written/day, 5 GB total storage and 10 databases (500 MB per database). Counts are constant-time totals rather than scans. Each request still writes rate counters, and votes/triggers/indexes/deletions add writes: the D1 daily write quota may exhaust BEFORE the Worker request quota. Free quota exhaustion causes unavailable ratings, not paid spillover. Keep account on Free; no paid upgrade or SLA is claimed. Monitor native dashboard quota usage manually without logging credentials/headers/bodies or adding analytics. Current-plan/account settings need owner verification before activation.

Sources checked November 15, 2026: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 exports](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Local verification (never production)

Use installed pinned Wrangler 4.105.0. RATE_SALT is a random secret in ignored ratings/.dev.vars, not an OAuth token. Keep it private and exclude it from review/PR artifacts. The compatibility date 2026-07-02 matches this pinned local workerd. No new project dependency is needed.

```powershell
node --test tests/ratings.test.js
npx.cmd wrangler@4.105.0 d1 migrations apply loghub-ratings --local --config ratings/wrangler.jsonc --persist-to .review/011/anonymous-state
npx.cmd wrangler@4.105.0 dev --local --config ratings/wrangler.jsonc --persist-to .review/011/anonymous-state --ip 127.0.0.1 --port 8787 --var RATINGS_ENABLED:true --var SITE_ORIGIN:http://127.0.0.1:4327 --var API_ORIGIN:http://127.0.0.1:8787
```

In separate terminals build the actual verified three-resource signed export with PUBLIC_RATINGS_ENABLED=true, PUBLIC_RATINGS_API=http://127.0.0.1:8787 and SITE_BASE=/; serve .site/production on 127.0.0.1:4327 using tools/site/serve.js. `node tools/ratings/browser-check.js` checks save/reload/change/remove for all three approved IDs, isolated browsers, accessibility, mobile/desktop and failure handling against the actual local Worker/D1. Set PLAYWRIGHT_CHANNEL=msedge locally or use installed Chromium. No sign-in or mock production vote is involved. Reset only the explicitly named isolated local state before repeating if another tester left votes; never target a remote database.

## Fraud exclusion and appeal

A maintainer with restricted D1 access investigates private database rows and evidence; public content reports alone grant no exclusion authority. Record a concise reason without personal data. Do not expose hashes as public identities. In a reviewed incident, insert the exact credential_hash and reason into excluded_credentials with one parameterized statement. The v3 trigger atomically excludes all its existing votes in the same database operation. Future upserts consult the exclusion table atomically, so deleting/recreating the vote does not clear exclusion. For a successful appeal, delete the exact exclusion row; the v3 trigger atomically restores eligibility for its remaining votes. Recheck totals against `SELECT project_id, SUM(score), COUNT(*) FROM votes WHERE excluded=0 GROUP BY project_id`. Anonymous identity rotation remains possible; do not claim a human ban. Never create a public admin endpoint or accept a caller-selected hash as voting authority.

## Private export and recovery

Ratings are mutable runtime data; they are NOT part of the immutable signed catalog backups. Keep seven days or less of encrypted/ACL-restricted exports off the public repository and Pages artifacts. Windows operators must set the destination parent's ACL to the operator before export (Unix mode alone is insufficient on Windows). Do not dump voter rows into CI logs or chat.

Freeze the Worker gate RATINGS_ENABLED=false and wait for in-flight requests to finish before a consistent export or recovery. Export to a NEW private directory:

```powershell
node tools/ratings/export.js ratings/wrangler.jsonc loghub-ratings C:\PRIVATE\NEW-EXPORT --remote
```

This uses pinned Wrangler, captures rows privately, exports votes.json plus a fresh ledger.json (erasures and fraud exclusions), and never restores sessions because none exist. Local verification uses --local. Record export time/version privately; retain RATE_SALT separately for consistent short-lived abuse counters, not vote recovery. Browser credentials cannot be recovered from hashes.

Before recovery obtain the FRESHEST ledger from the frozen current database, separately from the older vote export. Use a backup less than seven days old and ledger less than five minutes old. If the database/ledger is irretrievably lost or fresh deletions cannot be established, KEEP RATINGS UNAVAILABLE; do not silently resurrect votes or pretend a reset is recovery. A deliberate empty reset needs explicit owner approval and disclosure.

```powershell
node tools/ratings/recover.js C:\PRIVATE\OLD\votes.json C:\PRIVATE\CURRENT\ledger.json C:\PRIVATE\VERIFIED-CATALOG.json C:\PRIVATE\restore.sql
```

The helper validates inputs, excludes removed projects, reapplies later deletions and the authoritative CURRENT fraud exclusions and appeals, and emits only sanitized vote/exclusion inserts. Create an isolated empty D1 database, apply versioned migrations, import restore.sql with the gate off, then compare eligible counts/sums and all three project IDs against expected recovery results. Never import into a nonempty database. The helper also imports unexpired current deletion markers, preserving protection for the remainder of the seven-day backup window. Repoint the disabled Worker only after this verification and owner incident authorization. Do not use blind Time Travel/old SQL dumps that would undo deletions or exclusions. Resume only with explicit approval. Test exports/recovery locally before activation; delete expired private exports.

## Production activation gate - separate owner decision

1. Review the PR, bounded Zeroshot findings and green hosted checks; merge only after owner review. The live site continues preview voting meanwhile. No need to disable existing static publication or signed recovery.
2. Owner authorizes production Worker/D1 creation and activation separately. Confirm Workers Free/$0. Create exactly one ratings database and a separate loghub-ratings Worker, using pinned Wrangler on reviewed protected main. The authorized production database is loghub-ratings (a90fe4fa-dc7f-4b9a-8d26-51c2e968f72c). Retain its identity; never silently replace it. The owner-authorized config now enables workers_dev at https://loghub-ratings.siruiusamory.workers.dev; backend RATINGS_ENABLED remains false by default. SITE_ORIGIN remains https://loghub.pages.dev. Do not proxy/intercept Pages, add Pages Functions, change DNS, or share Pages/backup credentials.
3. Store a random RATE_SALT as a Worker secret using secure stdin. No GitHub OAuth credentials needed. Any deployment token must be account-scoped Workers Scripts Edit/D1 Edit in a separately restricted environment, never the Pages deployment job. Owner dashboard authentication may be necessary. No Worker credential or database ID is guessed.
4. Apply migrations with the backend RATINGS_ENABLED=false. Deploy reviewed Worker separately; observability remains off, no paid resources. Reconfirm CORS, catalog identity, aggregate endpoint, quota plan and rejection when gated off.
5. After explicit production voting approval, set backend RATINGS_ENABLED=true, verify unauthenticated aggregates and an authorized real anonymous test save/change/remove. Then set repository RATINGS_API_ORIGIN to the verified HTTPS Worker origin and RATINGS_ENABLED=true. Dispatch existing protected catalog.yml: signed publication and SAME sealed static artifact checks still apply. API/website toggles are separate; a failed API is never displayed as a submitted vote.
6. Verify real public desktop/mobile selection autosaves, reload persistence, edit/removal, card averages, all three IDs, privacy and errors. Do not count test votes in launch statistics: remove them. Record runtime version/database/migration and site workflow IDs. Only then declare live ratings.
7. Emergency: backend RATINGS_ENABLED=false stops API activity and shows unavailable where the enabled UI is deployed. Set repository RATINGS_ENABLED=false and republish through protected catalog.yml to restore the EXACT Preview only disclosure. Neither gate changes or unpublishes the directory. Never roll back its moderation policy or signed backup to repair ratings.




