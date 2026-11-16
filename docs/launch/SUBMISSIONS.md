# Universal project submissions (LOG-HUB-012)

Anyone can suggest, add, correct or claim a project at `/submit/` without a GitHub account, a Git repository, public source code or registration. Submission stays **default-off**: the site shows "Submissions are not open yet" until the owner activates it.

## What changed

- Native `/submit/` page: URL first, optional details folded away, four actions (Add, Suggest, Correct, Claim), review step, receipt, and `/submit/status/` for follow-up.
- Listings with hub-assigned IDs `ext-` plus 12 characters for projects with no GitHub repository. Existing `gh-<repoId>` IDs and ratings are unchanged.
- Source-aware labels: View Repository (Git hosts), Visit Project (everything else), Download Patch (only a moderator-approved HTTPS distribution). The hub never hosts ROMs.
- Duplicate detection by normalized address across hosts, suggesters and host moves.
- GitHub Issue Forms and `.loghub.json` manifests remain as advanced routes. Hosted manifests also work on gitlab.com and codeberg.org.

## Private intake service

`intake/` is a separate Cloudflare Worker plus D1 database (Free plan). It stores only a hash of each receipt, applies Turnstile, a honeypot field, per-network rate limits and a pending cap (`MAX_PENDING`), and returns 503 while `INTAKE_ENABLED` is `false`.

Activation (owner decision, not done by this change):

1. `wrangler d1 create loghub-intake`, put the id in `intake/wrangler.jsonc`, then `wrangler d1 migrations apply loghub-intake --remote`.
2. Make a moderator token with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and keep it private. Secrets: `TURNSTILE_SECRET`, `RATE_SALT`, and `ADMIN_HASH`, the base64url SHA-256 of that token: `node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('base64url'))" TOKEN`. Automatic claim proof works only for project-owned websites; forum, platform and Git claims are verified manually.
3. Deploy the Worker, set `INTAKE_ENABLED` to `"true"`.
4. For the protected production website build, set repository variables `INTAKE_API_ORIGIN=<worker origin>` and `TURNSTILE_SITE_KEY=<public site key>`. After the Worker has passed live checks, set `INTAKE_ENABLED=true` and dispatch `catalog.yml` on protected `main`. The workflow maps these to Astro's `PUBLIC_INTAKE_API`, `PUBLIC_TURNSTILE_SITE_KEY` and `PUBLIC_INTAKE_ENABLED` settings. Until then, leave `INTAKE_ENABLED` absent/false; the site's primary Submit link continues to use the working GitHub route.

## Moderator workflow

Set `INTAKE_API` and `INTAKE_ADMIN_TOKEN`, then `node tools/intake/moderate.js`:

| Command | Purpose |
| --- | --- |
| `queue`, `show ID` | Review pending submissions |
| `prepare ID DIR` | Fetch metadata and artwork through the SSRF-safe fetcher into a private directory |
| `adopt DIR [--approve]` | Move the reviewed listing into `listings/` and optionally record the exact content and artwork approval in policy |
| `claim-check ID LISTING [--apply]` | Verify the page-token challenge `loghub-claim-...` on the project's own page |
| `claim-manual ID LISTING --reason TEXT` | Record an out-of-band verification |
| `status LISTING suspended\|delisted\|approved\|review` | Suspend, delist or restore |
| `decide ID state` | Set the visitor-facing state and note |

Approval is always a human, signed-pipeline step: an unapproved or changed content digest or artwork set keeps the listing out of public artifacts. A claim that changes the proof digest needs `--transfer`. A repository file proves repository control, not team authority; third-party suggestions never grant ownership.

## Verification

`node --test` covers listings, intake Worker, moderator tooling, recovery and a generated project page. `npm run test:browser` covers the submit journeys (receipt, validation, duplicates, claim, status, mobile, axe). Status is never color-only: each state has a glyph and text.

## Live deployment record

- Worker `loghub-intake` at https://loghub-intake.siruiusamory.workers.dev, D1 `loghub-intake` (`7f30d601-b245-4384-95de-792b0b5ed48f`, WNAM), Turnstile widget `loghub-submissions` for `loghub.pages.dev`.
- The committed `INTAKE_ENABLED` stays `"false"`. The live gate was turned on at deploy time: `wrangler deploy --config intake/wrangler.jsonc --var INTAKE_ENABLED:true`. Redeploy with the same flag or the gate closes.
- Repository variables `INTAKE_ENABLED`, `INTAKE_API_ORIGIN` and `TURNSTILE_SITE_KEY` feed the protected website build. To roll back, set `INTAKE_ENABLED` to `false` and dispatch the catalog workflow; the site returns to the GitHub Issue Form route.
- Secrets live only in the Worker and a private local folder. Rotate by re-running `wrangler secret put`.
- Automated browsers usually fail the Turnstile check, so live end-to-end tests need a person to tick the box.
