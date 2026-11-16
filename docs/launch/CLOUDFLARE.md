# LOG-HUB-010: Cloudflare Pages Free preparation

Owner decision: project `loghub`, **https://loghub.pages.dev/**, root base `/`, **$0** hosting, no purchased domain/paid feature. GitHub retains intake, moderation, catalog publication, signed backups and protected receipts. Cloudflare receives only the verified static artifact. This PR does not authorize deployment.

## Verified requirements (November 15, 2026 Pacific)

Cloudflare's [Free limits](https://developers.cloudflare.com/pages/platform/limits/) allow 20,000 files and 25 MiB per static asset. Our inventory reserves one file for itself and rejects overflow. The documented 500 monthly managed builds concern Cloudflare builds; this pipeline builds on GitHub and uploads prebuilt assets. Provider quotas/rate limits still apply; no unlimited-deployment guarantee. No Functions/Workers requests, D1, analytics, paid upgrade or custom domain is needed.

[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) accepts a prebuilt directory through Wrangler. Use a Direct Upload project, not Git integration or an independent cloud build that bypasses signed publication. Cloudflare can allocate a suffixed subdomain if a name is taken: **no suffix/substitute is allowed**. An authenticated [GET project](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get/) must confirm `loghub`, `loghub.pages.dev`, production branch `main` and no Git source. The workflow never creates a project automatically.

[CI credentials](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/): account ID plus **Account → Cloudflare Pages → Edit** API token, restricted to the intended account. This is account-level Pages authority, not a claimed single-project token restriction. No DNS, Workers, billing or all-account permissions. Protect it as deployment authority. Account ID can be obtained from the account dashboard or Wrangler output without buying/adding a domain; pages.dev needs none.

Pinned CI tool: Wrangler **4.105.0**, also present locally (`--version`/help verified without authentication). Official `cloudflare/wrangler-action` is pinned to `9acf94ace14e7dc412b076f2c5c20b8ce93c79cd`. Its generic action name includes Workers, but this workflow invokes **Pages static Direct Upload only**, not `wrangler deploy`. It installs the exact requested CLI in an isolated temporary parent, outside the repository's config/Functions discovery. Metrics are disabled. No application dependency/lockfile was added.

## Owner setup, without uploading

1. Sign into the intended **Free** Cloudflare account and confirm no paid feature/upgrade is selected. This preparation did not authenticate/select an account or create a project/secret/deployment variable. Repository secret names currently contain no Cloudflare credentials.
2. On the owner's machine, authenticate interactively and create only the empty Direct Upload project:

   ```powershell
   npx.cmd wrangler@4.105.0 login
   npx.cmd wrangler@4.105.0 whoami
   npx.cmd wrangler@4.105.0 pages project create loghub --production-branch main
   npx.cmd wrangler@4.105.0 pages project list --json
   ```

   Confirm the intended account, Direct Upload mode and exact assigned hostname **loghub.pages.dev** in the project/dashboard. If the intended account already owns `loghub`, verify it instead of creating a duplicate. If creation fails or allocates a suffix, stop and report the conflict. **Do not** run `pages deploy`, drag/drop files or enable Git integration. Name availability remains unverified here: the unauthenticated URL probe failed, and no owner account/credentials were supplied for an authoritative lookup.
3. Create the narrowly account-scoped Pages Edit token in Cloudflare API Tokens, choose an expiry/rotation date and retain the value privately. In GitHub Settings → Environments create **cloudflare-pages**, restrict it to protected main, and add required owner review if desired. Store environment secrets **CLOUDFLARE_ACCOUNT_ID** and **CLOUDFLARE_API_TOKEN**. No token in chat/issues, source, command arguments, PR jobs or backup secrets.
4. Review/merge this PR with passing checks while **SITE_DEPLOYMENT_ENABLED stays absent/false**. Keep GitHub Pages disabled. Confirm the three-resource approved catalog, launch operator, failure notifications and independently stored signed export.
5. Record a **separate explicit owner go decision** for the first public deployment. Only then enable `SITE_DEPLOYMENT_ENABLED=true` and dispatch the existing catalog workflow on protected main, approving its environment gate as configured. This variable also allows subsequent successful catalog runs to upload; use environment approvals if every deployment must remain manual. No manual CLI upload is an equivalent shortcut.

## Integrity and limits of this preparation

The existing website job verifies signed recovery and current moderation, builds once with `/`, and seals all output files against the current build revision and policy hash. The deploy job downloads its exact immutable artifact ID and compares the independent manifest digest supplied by that upstream job; it never rebuilds. Static-only/size checks reject preview/subpath/dynamic output, mutation, extra/missing files, stale build and old policy. The signed export may correctly name an older unchanged-catalog source commit; the manifest separately binds the **current build_commit**.

Artifact and current main checks run again after Wrangler installation, immediately before upload. The existing short source-check/upload race remains: GitHub/Cloudflare do not provide an atomic policy/deployment transaction. A changed source requires investigation/rebuild, not a claim of atomic safety. No new signing key or recovery mechanism was introduced; the inventory is artifact-transfer integrity, not a substitute for signatures or approval.

Live account permissions, exact subdomain allocation, actual upload, HTTPS/CDN response and native rollback remain untested until owner setup and a separately authorized launch. No fake token/dry-run claim substitutes for them. [Deployment, monitoring and rollback checklist](DEPLOYMENT.md). Cloudflare's [native rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/) permits previous successful production versions, not previews, and does not understand Hub moderation; prefer reviewed revert plus current-policy rebuild.
