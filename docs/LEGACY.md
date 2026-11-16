# Legacy of Goku Hub pipeline

Static content infrastructure for Legacy of Goku, Legacy of Goku II and Buu's Fury projects. No website, database, CMS, accounts, monetization or running server. GitHub Issues collect submissions, Actions validates them, moderators merge approval PRs, and Actions publishes a JSON-and-images artifact.

Production `records/` is deliberately empty. Nothing in `tests/fixtures/` is a real community project or an approved listing. These fixtures also serve as complete example records and GitHub responses; never copy them into production.

## Local setup on Windows

Install Node.js 24 LTS and Git. From PowerShell:

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run validate
npm.cmd run build
Get-Content dist\catalog.json
```

Sharp uses the platform-specific binary installed by npm; do not use `--omit=optional`. No Python, compiler or global npm packages are needed on supported Windows x64/Linux x64 systems. Linux Actions uses the same commands with `npm`.

The offline build uses only approved records, committed snapshots and committed normalized images. It does not call GitHub. It is deterministic for identical inputs and the locked dependencies on the same platform: no current time, filesystem order or network data enters the build. Image normalization should be done once and committed; binary encoder equality across different CPU/library versions is not promised.

Optional live metadata refresh (public repositories work without a token, with lower API limits):

```powershell
# Optional: set GH_TOKEN to a read-only GitHub token in this shell; never commit it.
npm.cmd run refresh
npm.cmd run build
Get-Content report.json
```

Changes to `state/` require a PR and merge to persist. `.cache/github.json` holds ETag responses locally and is not committed. A daily Actions job restores and saves this cache. No background service or polling daemon is installed.

## Submission

1. Own a public GitHub repository, or use your account's public membership in the repository's GitHub organization. The API validates the actual repository owner/type and stable repository ID. Organization membership establishes affiliation, not authority to speak for a team; moderators verify that authority. If membership is private or you are a collaborator on another user's repository, contact a moderator for a manually verified PR instead of misrepresenting ownership.
2. Put a cover and optional screenshots in your repository. Use immutable raw image links: `https://raw.githubusercontent.com/OWNER/REPO/FULL_40_CHARACTER_COMMIT_SHA/images/cover.png`. GitHub's image file view → Raw can help obtain the path; replace a branch name with the full commit SHA. URL path spelling must match the submitted repository. No URL query, fragment, spaces, percent escapes, traversal, redirects or other hosts are allowed.
3. Open **New issue → Submit a project**. Fill in the JSON textarea; do not add backticks yourself (the Issue Form supplies the `json` fence). This is metadata entry, not website source editing. Keep the `Project record` heading intact when editing later.
4. Read the bot's validation comment. Correct the issue body and save to retry. A green validation is eligibility for review, not approval. The workflow only processes issue titles beginning `[Submission]`.
5. A moderator stages and merges the approval PR. The merged catalog artifact includes your project automatically.

An unreleased project can be listed with `status: "in-development"` and no release. Do not invent a release or fill in generated release fields.

### Editorial record schema

The authoritative machine schema is [`schema/project.schema.json`](schema/project.schema.json). Unknown fields are rejected. Required fields:

| Field | Rule |
|---|---|
| `id` | Unique lowercase slug, 1–64 characters; starts with a letter, hyphens between alphanumeric segments. Stable after approval. |
| `title` | 1–100 characters |
| `developer` | Team or developer attribution, 1–100 characters |
| `description` | 20–2000 characters |
| `game` | `legacy-of-goku`, `legacy-of-goku-2`, `buus-fury`, `multiple` |
| `category` | `rom-hack`, `fan-project`, `tool`, `resource` |
| `status` | `in-development`, `released`, `on-hold`, `discontinued` |
| `repository` | Canonical `https://github.com/OWNER/REPO`; no `.git`, trailing slash, subpath, credentials, query or fragment |
| `cover` | Pinned raw URL from this repository, at most 500 characters |

Optional fields:

| Field | Rule |
|---|---|
| `screenshots` | 0–6 unique pinned raw image URLs |
| `asset_name` | Exact release distribution filename, up to 200 safe ASCII characters; required when there is more than one supported distribution asset |
| `featured` | Boolean, moderator-only; default false. Cannot be requested as true through the submission form. |

Text is trimmed single-line plain text, without HTML or control characters. Use JSON strings, not Markdown rendering instructions. Future consumers must render strings as text, not HTML. One listing per repository and one per ID, including repositories discovered under renamed URLs. Earlier valid open submission issues also reserve their ID/URL; resolve or close an obsolete duplicate issue before resubmitting. This reservation is not approval or proof of ownership. `multiple` means the project targets more than one supported game.

### Images

- Static PNG, JPEG or WebP only. No SVG, GIF, animation or executable uploads.
- Each input: at most 5 MiB, 20 million decoded pixels, and 8192 pixels on either side. Corrupt/truncated files are rejected. Content signatures and decoded formats are checked; file extensions alone are insufficient.
- Cover: 640 × 360 WebP (16:9). Screenshots: 480 × 320 WebP.
- The full image is fitted inside the output with dark letterboxing; no stretching or cropping. EXIF rotation is applied, metadata removed, transparency flattened and WebP optimized at quality 82.
- Output: `assets/PROJECT_ID/cover.webp`, `screenshot-1.webp` through `screenshot-6.webp`. Tiny images are allowed but will be enlarged; supply at least the target resolution for good quality.
- All inputs decode successfully before any normalized files are written. Image source links are checked on maintenance runs; previously normalized assets are kept when a source link goes away.

## Release integration

Only public GitHub repositories and GitHub Releases are distribution sources. The GitHub REST API retrieves repository identity, owner, archive state, update date, latest stable release, and paginated release assets. Drafts, prereleases and source-code archives generated by GitHub are excluded. The policy is GitHub's **latest stable release**, not an arbitrary semver parser or the newest prerelease; if that release has missing/ambiguous assets, validation fails rather than silently choosing an older download.

Supported distribution extensions: `.zip`, `.7z`, `.tar.gz`, `.ips`, `.bps`, `.ups`, `.xdelta`, `.exe`, `.msi`, `.dmg`, `.AppImage`. An exact `asset_name` selects one of these. Executables are linked only, never uploaded, downloaded or run by this pipeline. ROM filenames (`.gba`, `.gb`, `.gbc`, `.nds`, `.rom`, `.bin`) cannot be distribution assets. Archives are not opened: moderators must verify patch-only ROM hack distribution and content rights.

Generated release data includes `version`, `download_url`, `file_name`, byte `file_size`, UTC `release_date`, asset `updated_at`, and nullable `sha256`. SHA-256 is read from GitHub's native release-asset `digest`; checksum sidecars and arbitrary release-body text are deliberately not interpreted. Missing native digests yield `null`, never a fabricated checksum. `last_updated` is the maximum GitHub repository update/asset update/release date; it is not an editorial edit timestamp.

Renames are followed only through bounded redirects on `api.github.com`, preserving stable repository identity. Existing image assets survive moved source URLs; moderators should update editorial repository and pinned image URLs in a PR. Name reuse with a different repository ID requires human review. Archived repositories remain listed with an archive flag. Private, missing or deleted repositories cannot be newly approved. Existing snapshots retain their last valid release on API/network/rate-limit failure, disappearing releases or malformed responses, and expose `availability: "unavailable"` plus a warning. Recovery clears the warning. Successful responses use ETags; API calls are sequential, bounded and timed out. Rate limits fail promptly with retry/reset information rather than spinning or hammering GitHub.

Maintenance also checks pinned image links and uses HEAD requests to check download links, following only a short allowlist of GitHub CDN hosts. It never fetches download bodies. Broken links appear in `report.json`; a failed link never deletes existing metadata or image assets. A temporary HEAD failure is a report warning, not proof of permanent removal.

## Moderation and repository setup

These settings require a GitHub owner; this repository does not modify external settings:

1. Create a public GitHub repository with default branch **main**. Enable Issues and Actions. If using another default branch, update the `push.branches` filters in `ci.yml` and `catalog.yml`.
2. In Actions settings, allow GitHub Actions to create pull requests. Keep the default token read-only; workflow jobs request only the extra permissions they use. No PAT is needed. Organization policy may prohibit bot-created PRs; resolve that policy or stage a PR locally.
3. Create environment **moderation**, restrict it to the default branch, add trusted moderator reviewers, and prevent self-review if available on your plan. Workflow dispatch already requires repository write access; the environment is an additional approval boundary.
4. Protect `main`: require a moderator PR review and the `test` check from **Test and validate**. Restrict direct pushes, forbid force pushes and add actual moderator usernames to a `.github/CODEOWNERS` file for `records/`, `state/`, `assets/`, `src/`, `schema/`, `package*.json` and `.github/`. Do not paste placeholder usernames into production rules.
5. Run **Test and validate** and **Publish catalog artifact** once from Actions so their checks/workflows are registered. Then exercise a real owner-approved submission end to end before advertising submissions.

For a valid submission: review the issue, choose **Actions → Stage project approval → Run workflow**, keep the default branch selected, and enter its issue number. The job re-fetches the *current* issue and revalidates the repository, submitter, release, duplicate identity and every image. It does not trust old comments or uploaded artifacts. It stages only `records/`, `state/` and `assets/` in `approval/issue-N`, then opens a PR. The bot does not merge it. Later issue edits cannot mutate the staged PR; dispatch again to restage or request a fresh PR.

The bot's own PR does not trigger a normal `pull_request` run with `GITHUB_TOKEN`. A separate, minimal `actions: write` job explicitly dispatches the read-only CI workflow on the staged branch. The staging job itself also tests and validates the complete resulting catalog before creating the PR. If CI dispatch is disallowed by organization policy, manually run **Test and validate** against that PR branch before merging. Protect workflow/code changes with moderator review; writable branch access is a trusted role.

Final moderator checklist: verify the submitter's authority, project relevance, game/category/status, image rights, release content/distribution, appropriate featured status, passing checks and the exact PR diff. Automation does not establish malware safety, licensing or the absence of a ROM inside an archive. Merge is the final approval. Close the submission issue after merge. Merging automatically builds and uploads `catalog` under the workflow run's Artifacts; this publishes an artifact, not a GitHub Pages site or a release.

For manually verified team submissions or local staging:

```powershell
$env:GITHUB_REPOSITORY = 'YOUR-ORG/YOUR-HUB'
$env:ISSUE_NUMBER = '123'
# GH_TOKEN must have read access to that issue and public repository metadata.
node src/cli.js stage
npm.cmd test
npm.cmd run validate
git add records state assets
# Commit and open a PR using your normal GitHub workflow. Never commit .cache or .staging.
```

The staging command enforces owner/public-member affiliation. For an exception verified by moderators, create the editorial record in a moderator PR, run `refresh` to produce its snapshot, then normalize its images using the command below. The PR review is the authority for that exception.

## Updates and maintenance

**Refresh GitHub metadata** runs daily at 07:23 UTC and on manual dispatch. It checks approved repositories only, refreshes snapshots and link diagnostics, builds a catalog-refresh artifact, and opens/updates one `maintenance/github-metadata` PR. Review and merge that PR to persist the snapshot and publish the normal catalog artifact. This intentionally uses the same protected-branch review path rather than granting a bot a direct-push bypass. It needs no custom service. New projects always require human approval; metadata refreshes are mechanically generated but also use PR merges.

For editorial/image changes, edit the relevant record in a PR, then:

```powershell
npm.cmd run refresh
node src/cli.js images EXISTING-PROJECT-ID
npm.cmd run validate
```

Use the approved ID, not a file path. Removing a screenshot makes its old normalized file unused; the catalog generator only copies approved referenced files. To delist, remove its record in a moderator PR (and optionally its state/assets). Builds never infer approval from a cache or fixture directory. Do not rename IDs casually: links may depend on them.

Download `catalog` or `catalog-refresh` from Actions Artifacts. Artifacts expire after 30 days; `records/`, `state/` and `assets/` in Git are the durable source, so rerun **Publish catalog artifact** to recreate one. `report.json` is diagnostic and is not a source record. Review failure notifications and Dependabot PRs; no hosted service credentials, cron server or database backups are required.

## Catalog contract

[`schema/catalog.schema.json`](schema/catalog.schema.json) describes `dist/catalog.json`. Each project contains editorial metadata, local cover/screenshots, repository identity/availability, nullable release data, featured flag, normalized `search_text` and last update. `filters` lists populated games/categories/statuses. `sort` contains ID arrays for case-insensitive title ascending, release date descending and update date descending, with stable ID tie-breakers and missing release dates last. Project storage order is ID ascending. Consumers can filter metadata without a backend; no search UI exists here.

Builds validate snapshots, ensure required image dimensions, reject duplicate stable IDs, and emit only approved assets. They fail rather than publish a partial invalid catalog. GitHub artifact upload runs only after a successful complete build. Keep treating catalog strings and download software as untrusted at consumption time.

## Tests and verification limits

`npm test` uses synthetic fixtures and bounded mocked HTTP responses. It covers required/invalid fields, duplicate IDs/URLs/stable identities, ownership, image signatures/corruption/size/pixels/aspect handling, unavailable/private/archived repositories, releases/no releases/missing assets, invalid metadata/download URLs/checksums, API errors/rate limits/cache/redirects, HEAD-only link checks, staged approval, catalog sorting/filter metadata and repeatable builds. It also parses workflow/form YAML and checks immutable actions, permissions and approval boundaries.

No real community-approved listing is supplied. A live community integration test and GitHub-hosted Issue Form → approval → merge → artifact run must be performed after account/repository configuration; fixtures are not evidence of a deployed workflow. This project does not publish a remote repository or change GitHub settings.

API and security behavior follow the [GitHub Releases API](https://docs.github.com/en/rest/releases/releases), [repository API](https://docs.github.com/en/rest/repos/repos), and [Actions secure use guidance](https://docs.github.com/en/actions/reference/security/secure-use). Image processing uses [Sharp](https://sharp.pixelplumbing.com/). The [SAGE directory](https://www.sagexpo.org/) is inspiration only; no frontend is included.
