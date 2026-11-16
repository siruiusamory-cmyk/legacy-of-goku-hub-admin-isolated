# Private administration (LOG-HUB-013)

Prepared for review, **not activated**. Production migrations, administrator deployment, account provisioning and merge require separate owner authorization. Anonymous intake, ratings and the public site remain operational.

## Authentication decision

Choose Cloudflare Access Free, email one-time PIN, an explicit administrator email policy and a separate `loghub-admin.<account>.workers.dev` origin. [Official pricing](https://www.cloudflare.com/plans/zero-trust-services/) supports up to 50 Free users; [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) supports workers.dev without purchasing a domain. Putting Access on the existing anonymous intake service would interfere with public submissions. Custom passwords or email links add credential recovery/delivery machinery; GitHub OAuth adds unnecessary account coupling. A browser-held moderator bearer token is unsafe. No new runtime dependency or paid service was added.

The Worker independently validates RS256 signatures, issuer, audience, app-token type, expiry, issued-at, subject and its own email allowlist: [official JWT guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/). Checking a header alone is insufficient. D1 stores only the hash of a random browser session credential, with a maximum 30-minute lifetime bounded by the Access expiry. Cookies are HttpOnly, Secure and SameSite=Strict. Mutations require the exact Origin and CSRF token. Identity/authorization are rechecked on every request. Logout deletes all sessions for that subject and rejects its old identity tokens; administrators can revoke other subjects. Permanent removal requires removing the email from **both** allowlists. [Access session administration](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/) supplies an additional control.

## Owner workflow

1. Open the protected administrator origin, authenticate by allowed email PIN and select **Sign in**.
2. Search, filter and sort the paginated inbox. Select a submission to inspect all supplied metadata, notes, source/download links, artwork references, ownership challenge and history. Duplicate warnings include pending submissions and current listings.
3. Start review, request corrections or reject with a public reason. Receipt holders see public notes; private notes stay in the dashboard. Reload after the anonymous submitter revises. Stale revisions are rejected.
4. Correct the form fields, then **Prepare private review**. Preparation fetches artwork through the existing DNS-pinned, bounded HTTPS fetcher, rejects redirects/private addresses and normalizes with Sharp. The browser never loads submitted artwork URLs directly.
5. Refresh Publication reviews. Inspect every normalized image, metadata field, link, warning, proposed policy and hash. Acknowledge content/artwork review and approve the exact package. Approval is distinct from publication.
6. Select **Prepare protected publication PR** and confirm. Only approved listing files, original artwork and policy enter the public branch. Receipts, submitter notes, manual evidence and unapproved material are excluded. Open the PR in GitHub's browser UI; normal protection governs merge. The dashboard cannot merge.
7. **Verify PR checks and deployment** requires a merged PR, a successful catalog run with successful synchronize/backup/anchor/publish/website/deploy jobs, the live manifest's exact build revision, merge ancestry and expected catalog presence/absence. Only then does it report publication/withdrawal and supply a live URL. Receipt lookup performs no GitHub operations.
8. Existing listings includes live catalog identities plus withdrawn identities from policy. Edit metadata/HTTPS artwork references, or prepare suspension/delisting/restoration with a reason. Repeat exact review and protected PR. IDs and ratings keys remain unchanged.

Claims on project-owned websites can use the private receipt challenge with a reason prefixed `page-token:`. Shared forums/platforms/Git pages require documented manual evidence (at least ten characters). Changing an existing claim needs an explicit transfer acknowledgement. Proof of control never implies team representation or artwork rights. First convert a legacy GitHub listing to a managed listing through an exact-reviewed metadata edit before attaching a claim. Migration retains the stable ID/owner and validates the replacement's exact content/artwork before retiring old intake processing.

## Private processor and authority

The default-off `admin-review.yml` runs only from protected main, in `admin-processing`. Inputs contain only an opaque review ID and action. It pulls data from authenticated private `/processor/` endpoints. No submission artifacts are uploaded. Exceptions go to the private dashboard; public logs get a constant failure message. Temporary files are deleted in `finally`.

Preparation uses a read-only GitHub token. Publication uses a **separate source-repository GitHub App**, limited to contents/PR writes. Never reuse the backup App. The administrator Worker holds an actions-dispatch/read-status credential, no contents-write credential or backup/signing keys. The browser receives none of these credentials. The existing moderator bearer token is unused by the dashboard/processor.

Approval binds complete package JSON, ordered original/normalized hashes, project identity, proposed policy and base commit. Publication rehashes bytes before sending them to GitHub. If main moved, preparation/approval must be repeated; reviewed policy is never automatically rebased. Existing branch protection, signed backups, recovery anchors and deployment remain final authority; `catalog.yml` is unchanged.

Up to six unfinished packages bound raw-image storage within Free D1's 500 MB limit. Stale/failed artwork is cleared before new preparation. Original chunks are deleted after PR creation. Previews last seven days (at most the latest twenty PR previews); cleanup runs during preparation. Existing intake expiry cascades to its reviews. An interrupted processing job can be replaced by preparing again from its inbox/listing. PR creation interruption can leave an already-approved public branch/PR: inspect `admin/<review-id>` before repeating. No automatic merge/deployment occurs.

## Activation: separate owner authorization required

No steps below were executed against production:

1. Select Zero Trust **Free**, email PIN and Access apps covering the exact administrator hostname/all paths. Human policies allow only explicit administrator emails. No Everyone/bypass policy. Use dedicated Access service authentication for `/processor/*` only; service credentials cannot authenticate browser routes. Set human sessions to 30 minutes.
2. Apply `intake/migrations/0002_admin.sql` to the existing intake DB. It adds tables/columns/indexes. Deploy the updated intake Worker preserving all **live settings**, especially `INTAKE_ENABLED:true`; its checked-in default is false. Do not blindly redeploy defaults or interrupt anonymous intake/ratings.
3. Administrator Worker vars: `ACCESS_ISSUER` (exact `https://TEAM.cloudflareaccess.com`), `ACCESS_AUD`, comma-separated `ADMIN_EMAILS`, exact `ADMIN_ORIGIN`, `SITE_ORIGIN`, `SOURCE_REPO`. Secret `GH_DISPATCH_TOKEN`: repository Actions read/write, Contents read, Pull requests read, Checks read, commit-status read, Administration **read only** (to display actual required checks); no contents-write/administration-write/bypass. Use a renewable scoped credential.
4. Generate a fresh random 32-byte base64url **processor** token. Worker secret `PROCESSOR_HASH` is its **base64url** SHA-256; the original becomes environment secret `ADMIN_PROCESSOR_TOKEN`. Do not reuse the legacy moderator token/hash.
5. Protect GitHub environment `admin-processing` to protected main only. Confirm this restriction is supported on the account's Free plan; fail closed if unavailable. Environment vars: `ADMIN_API`, `ADMIN_PUBLISH_APP_ID`. Secrets: `ADMIN_PROCESSOR_TOKEN`, `ADMIN_ACCESS_CLIENT_ID`, `ADMIN_ACCESS_CLIENT_SECRET`, `ADMIN_PUBLISH_APP_PRIVATE_KEY`. Install the separate publisher App on this source repository only, Contents write/PR write, without protection bypass. Existing backup credentials stay in their current jobs.
6. First deploy `admin/wrangler.jsonc` with `ADMIN_ENABLED:false`; all browser/API/processor paths must return 404. Verify exact hostname, Access coverage and disabled preview URLs. Enable repository `ADMIN_PROCESSING_ENABLED=true` only after restrictions are verified; separately enable Worker `ADMIN_ENABLED:true`. This PR leaves both gates off/unset.
7. Repeat the lifecycle using a separate private/isolated Worker, D1 and GitHub test repository. Never publish fictional projects to production. Complete owner PIN login, logout and revocation before relying on production moderation.

Shutdown: disable the administrator Worker gate, revoke service/dispatch credentials and administrator sessions/Access identities. This does not disable anonymous submissions/ratings or unpublish existing catalog entries. Withdrawal still follows protected policy and the existing deployment/recovery procedure.

## Verification scope

`node --test tests/admin-dashboard.test.js tests/intake.test.js tests/intake-admin.test.js tests/listings.test.js tests/self-service.test.js`: real Worker handlers, in-memory SQLite, signed synthetic identity tokens, Sharp, preparation, exact PR trees, catalog suspend/restore, concurrent approval, stale writes, revoked sessions, CSRF and unauthorized API access. GitHub/Access/deployment are deterministic doubles, not live account proof.

`npx playwright test --config playwright.admin.config.js`: real dashboard in desktop/mobile Chromium, simulated Access edge, correction/review/approval/PR-initiation, normalized images, malicious content rendering, automated accessibility and horizontal-overflow/session-revocation checks. Locally set `PLAYWRIGHT_CHANNEL=msedge` if Chrome is absent; CI uses Chrome. Physical devices/assistive technology, real PIN delivery and production settings remain unverified until authorized activation.
