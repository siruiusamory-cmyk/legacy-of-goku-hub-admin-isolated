# Content moderation (LOG-HUB-006)

For routine operation use the concise [maintainer checklist](launch/MODERATION-CHECKLIST.md), exercised in LOG-HUB-007 and prepared for launch in LOG-HUB-008. See [emergency removal/rollback](launch/DEPLOYMENT.md). Current protection requires strict `test` and PRs but zero human approvals/no enforced CODEOWNER review (owner change during LOG-HUB-005); actual human content inspection remains required by this procedure, not inferred from GitHub approval enforcement.

## Policy and publication authority

Every first listing needs a human content decision in `policy/publishing.json`, through a normal protected source PR. There is no trusted-owner exception. Repository ownership, team representation, content approval and technical validation are different decisions. A label, submitter checkbox, issue author, manifest or bot cannot grant approval. CODEOWNERS remains the ownership map; this change does not alter GitHub protection settings or add paid features. Only authorized maintainers should merge policy changes; automated checks cannot decide whether an image is appropriate.

Prohibited: explicit sexual imagery; abusive, hateful or threatening imagery/text; harassment; unlawful content; misleading impersonation; unrelated spam; copyrighted ROM uploads or misleading download claims. Require appropriate rights for submitted artwork. Attribution alone is not permission. GitHub-hosted downloads and automated checks do not establish malware safety.

## Existing controls and the gaps closed

Preserved: static PNG/JPEG/WebP, 5 MiB, 20 megapixels, 8192px per side, corrupt/animated/unsupported rejection, proportional contain normalization to 640x360 covers and 480x320 screenshots. HTTPS same-repository, full-SHA raw URLs, no image redirects, bounded downloads, stable numeric repository/owner identities, representative policy, transfer review, duplicate identity rejection, release/asset checks and GitHub-only distribution remain intact. No submitted software executes.

Gaps closed: trust previously allowed first publication; same URL previously reused artwork without content verification; held candidates were written under a public Actions artifact; restored snapshots needed current artwork approval; the legacy staging workflow could put unapproved images in public PRs. It now grants no approvals and writes no files. Legacy `submission`/`stage` CLI commands fail with migration guidance.

## Review privately on Windows

1. Open the normal manifest or guided Issue Form. Automatic synchronization gives field errors and metadata/hash-only review notices in `validation-report`. It does not upload candidate artwork. Both methods use the same validation pipeline.
2. On a trusted maintainer computer, with Node24 and existing dependencies installed:

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
$env:GITHUB_REPOSITORY = 'siruiusamory-cmyk/legacy-of-goku-hub'
node tools/moderation-review.js --issue 123 C:\Users\hears\Private-LoG-Review-123
# Or a repository manifest:
node tools/moderation-review.js --repository https://github.com/OWNER/REPO C:\Users\hears\Private-LoG-Review-456
```

The destination must be new and outside the public source tree. Keep it on private local storage, outside shared/synced folders. The tool refuses CI/Actions, does not upload anything, never executes project software, and saves normalized images plus `review.json`. Inspect every image at full size, repository/owner identity, team attribution, title, description, links and release/download metadata. Review the source image too if rights or content are unclear. Never upload this directory, post its images in public issues, or commit it. Original images in the developer's public GitHub repo remain under GitHub's control.

3. `review.json` contains a **proposed**, inert policy object. After actual inspection, add/merge the relevant fields into the protected policy PR:

- `repository_id`, `owner_id`, `project_id`: exact stable identities (normally `gh-NUMERIC_ID`).
- `decision: approved`: human decision, not trust inheritance.
- `content_digests`: first-publication digests binding the complete validated record and release to repository and owner. A changed first record/release requires another review.
- `artwork_sets`: approved ordered arrays: cover first, then screenshots. Each entry contains `source_sha256` and normalized `sha256`. Approval is for the whole intended image set, not a URL or filename. Keep the previous approved set while reviewing a replacement; append the new reviewed set to approve it. Removing an approval revokes its reuse.
- Existing `approved_issue`/`approved_digest` for third-party guided content, explicit `representative_ids` and `representation_verified` remain separate authority controls.
- Existing `featured` is administrator-only. Review output never grants broad owner trust.

For legacy IDs, maintainers must bind the intended existing project ID rather than silently approving a second identity. Do not blindly copy a proposal. Hashes alone do not mean a human reviewed the content. Do not accept policies from developers' repositories.

4. Merge through normal PR protections. Normal scheduled/event synchronization fetches images once, hashes those bytes, normalizes those same bytes and writes only the approved outputs. There is no second fetch between the approval comparison and write. Any source-byte, normalized-byte, screenshot-count or ordering change invalidates the match. Even a raw metadata-only image change needs approval. A new manifest commit with identical images does not.

## Holds, rejection, reports and removal

If a replacement is not approved or a source fails, preserve the entire last approved record, release and images. Maintainer reports show pending hashes/reason; no replacement image bytes enter `snapshot`, `work/dist`, candidate artifacts or the website. Once its exact set is approved, ordinary sync resumes. No classifier or production AI dependency is used.

Metadata/release maintenance of established approved listings continues under the existing ownership/sensitive-field checks. This is not continuous human moderation of every description edit: report misleading/inappropriate updates promptly and set `decision: review` to freeze the listing, or `suspended`/`delisted` to exclude it. Attribution/game/category changes still require the exact `approved_metadata_digest`. Releases remain automatic. A suspension/delisting cannot be undone by another issue or a trusted owner.

Reject an issue by adding its number to `rejected_issue_numbers`, then close/lock it on GitHub as appropriate. Use `blocked_user_ids` for repeat abusive submitters, GitHub's account-block/report facilities for sustained abuse, and `revoked_owner_ids` for compromised controllers. `review` freezes updates; `suspended` temporarily removes; `delisted` removes until explicit policy reversal. Use `reason` to record the decision. For inappropriate already-published artwork, remove its set from `artwork_sets` and suspend/delist; do not leave the rejected set approved. Already downloaded historical public artifacts cannot be recalled automatically: delete affected artifacts manually and investigate any downstream copies.

Intake reads at most two pages of 100 recent open issues, resolves at most20 submissions per account per batch before further repository calls, and coalesces repositories by stable ID. Previously approved guided source issues are fetched directly so a saturated ledger does not silently roll them back. Close/lock duplicates; legitimate new submissions outside the bounded window can be reopened/retried after cleanup. More than1200 input rows fails closed. Spam may delay new intake or consume GitHub's bounded workflow/API quota; it cannot grant approval. No permanent per-user rate-limit service is claimed. No automatic account bans or label-based approvals.

## Recovery and artifact boundaries

Signed backups preserve approval receipts (initial content digest and source/output image hashes), never administrator policy. On synchronization, restored entries without current matching content/artwork approvals are held and not copied to public outputs. A legacy snapshot without receipts is not grandfathered in. Existing approved suspended data can remain in recovery state but is excluded from the public catalog. Removing approval excludes those image bytes from new snapshots as well.

Backup and final-publication verification recheck current source policy and output hashes. Production site generation rechecks current identity-bound approval before copying any images from signed exports. It also excludes current suspensions, delistings and revoked owners. A signed historic export is integrity evidence, not current moderation permission. Offline archive restore can retain historical bytes locally; it never grants publishing authority. Source-revision checks continue to reject stale-policy publication. Partial outputs are discarded; publication uses a fresh output directory.

Review staging is local-only; the existing real-repository preview is a development-only owner-reviewed input, never an intake or public preview service. CI browser previews contain harmless synthetic fixtures only. Do not add arbitrary submissions to frontend fixture generation or upload local review directories. The public Actions candidate contains only currently approved normalized images, receipt metadata and hash-only review reports. GitHub artifacts are publicly downloadable in a public repo: do not use them as a moderation holding area.

The production catalog is empty. This milestone approves no community project and does not deploy a site. No new runtime dependencies, CMS, dashboard, database or AI service are introduced.

Isolated hosted integration fixtures also need explicit reviewed hashes in `policy/integration-content.json` before running `hosted-integration.yml`. That separate file starts empty and can authorize only the existing integration fixture ID1458327252; the hosted tool refuses other identities. It is never read by the production publisher. The previous trust-only integration bootstrap is deliberately no longer an approval path. This milestone does not populate it or re-run hosted publication experiments.

Revoking the last approved image set may produce an empty snapshot. This is allowed only when current protected policy explicitly suspends/delists every previous registry identity (matching repository, owner and project IDs). Removing approvals alone, missing rules or mismatched identities still fails the empty-state safety guard. Historical recovery points are preserved.

Use the Report project content Issue Form for inappropriate artwork or misleading information. Reports notify maintainers, carry no publication authority and do not automatically hide projects. Supply URLs and text only, not image attachments.
