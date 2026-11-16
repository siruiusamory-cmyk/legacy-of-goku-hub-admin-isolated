# Cloudflare Pages deployment and rollback checklist

LOG-HUB-010 supersedes the GitHub Pages plan. Host: **Cloudflare Pages Free**, project **loghub**, exact URL **https://loghub.pages.dev/**, base **/**, budget **$0**. No custom domain, paid feature, Workers/Functions, database, analytics or persistent ratings. Deployment is disabled; this checklist is not authorization.

## Before first live upload

- [ ] Follow [owner account/project/secret setup](CLOUDFLARE.md). Confirm Free, an existing Direct Upload project `loghub`, production branch `main` and exact subdomain `loghub.pages.dev`. Stop on conflict/suffix; no alternate URL or Git integration.
- [ ] Review/merge the LOG-HUB-010 PR with passing required test/frontend checks. Preserve branch/receipt protections, three approved LOG-HUB-009 resources/artwork and DragonByte exclusion.
- [ ] Configure GitHub environment `cloudflare-pages`, protected-main restriction, optional required owner review, and environment secrets `CLOUDFLARE_ACCOUNT_ID`/account-scoped Pages Edit `CLOUDFLARE_API_TOKEN`. No credentials in source, command arguments, public issues or other jobs.
- [ ] Keep `SITE_DEPLOYMENT_ENABLED` absent/false until a separate explicit owner go decision. Keep `PUBLISHING_ENABLED=true`; do not enable GitHub Pages.
- [ ] Confirm launch operator/backup maintainer, Actions failure notifications and independent signed recovery kit. The existing health job checks catalog publication, not Cloudflare HTTP availability. No paid monitor is added.

## Authorized workflow and smoke tests

1. Owner records approved source SHA, exact URL and catalog point. After the separate go decision, enable `SITE_DEPLOYMENT_ENABLED=true` and dispatch the existing catalog workflow on protected main. This permits subsequent successful catalog runs too; use environment approvals if every upload needs manual authorization.
2. Synchronization → private signed backup → protected receipt → final publication must succeed. The website job exports/verifies that recovery point, applies current moderation, builds once with `/`, seals its file inventory/current build/current policy and uploads the immutable `website` artifact.
3. Deploy requires protected main and successful publish/website jobs. It downloads that exact same-run artifact ID, never a separate build. The independent manifest digest from the website job checks every filename/size/hash and current build/policy. Preview/subpath input, altered/added/missing files, dynamic execution and Free-limit overflow fail closed.
4. Authenticated GET checks the existing exact project before writes. Pinned Wrangler runs `pages deploy website --project-name=loghub --branch=main` in an isolated temporary parent, with no project config/Functions discovery. Artifact and current source checks repeat after CLI installation, immediately before upload. Cloudflare secrets remain in this job; it has no backup secrets or GitHub write permissions.
5. Record Actions run, artifact ID/manifest digest, signed point/current policy, Cloudflare deployment ID and production hostname. Verify HTTPS/certificate at **https://loghub.pages.dev/**; direct detail reloads, root assets/fonts/images, 404, desktop/mobile cards/filters/navigation, repository/documentation links and submit/report chooser. Confirm exactly three resources, accurate release/download absence, unrated display and “Preview only · not saved”, no fixtures/DragonByte. Public HTTP/CDN checks await the authorized first upload.
6. Inspect the deploy job and GitHub failure notifications after each upload; the existing catalog notification job covers publication, not deploy failure. Check live availability manually after changes/outage reports. Record the next scheduled catalog/deployment result; no analytics/paid monitoring service is introduced.

## Safe local verification (no Cloudflare contact)

With current source/dependencies and a verified extracted signed export:

```powershell
$env:SITE_BASE = '/'
node tools/site/build.js --snapshot C:\SafeExports\CURRENT-EXTRACTED-EXPORT
$launchBuildSha = git rev-parse HEAD
node tools/site/check-deployment.js seal .site/production $launchBuildSha
# Use the exact digest emitted above; do not freshly trust a substituted manifest:
node tools/site/check-deployment.js verify .site/production $launchBuildSha MANIFEST_SHA256
$env:SITE_SERVE_DIR = '.site/production'
$env:PORT = '4324'
node tools/site/serve.js
```

Inspect `http://127.0.0.1:4324/`. Never upload fixture/real-preview output or an old repository-subpath build. The signed export's source commit can be older for unchanged catalog data; the manifest binds the current **build_commit and policy hash**. The inventory is CI transfer integrity, not a new signature scheme or content-approval authority.

## Rollback, withdrawal and emergency stop

1. Owner/operator disables `SITE_DEPLOYMENT_ENABLED` and cancels queued/running uploads. Disable `PUBLISHING_ENABLED` too when catalog/security investigation needs a freeze. These stop future writes; they do **not** unpublish Cloudflare content, version-specific URLs or downloaded copies. GitHub Pages settings do not control Cloudflare.
2. Preferred rollback: normal reviewed frontend revert preserving **current** moderation/recovery policy; rebuild from current verified recovery through this workflow. Old-artifact replay is rejected on build/policy mismatch. Do not weaken guards to upload old output.
3. Cloudflare Deployments → an earlier successful production version → **Rollback to this deployment** is available; previews cannot be rollback targets. Use only under explicit incident authorization after verifying its recorded catalog/manifest/artwork remains currently approved and root-path compatible. Withdrawn content must never return through rollback: suspend/delist/revoke exact policy identities/hashes and publish a newly verified clean build instead. Review historical public deployment/artifact URLs separately; private signed history remains intact.
4. Immediate takedown before a clean rebuild requires explicit owner incident authorization for Cloudflare account-level removal. Deleting the `loghub` project is destructive, removes deployment history and can lose this exact hostname; confirm target and consequences first. It is not routine rollback and does not authorize a replacement URL. Verify affected URLs cease serving content and investigate caches/downstream copies.
5. Missing/damaged signed recovery still follows [operations](../OPERATIONS.md): inspection-only export, exact administrator-approved point/observed-newest/reason, no silent fallback, empty initialization or casual key rotation. Host rollback does not authorize recovery-policy rollback.
6. Resume uploads only after owner incident resolution/go authorization. Record signed publication, Cloudflare deployment ID and smoke tests. No mechanism recalls previously downloaded content.

Local tests verify stale/mutated/policy-revoked artifact rejection and exact target checking; no live Cloudflare upload or rollback was performed. Provider limits, token permissions and native rollback references are in [Cloudflare preparation](CLOUDFLARE.md).
