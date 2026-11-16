# Local verification : 2026-11-14

Environment: Windows x64, Node.js 24.16.0, npm 11.13.0. No remote repository was created or modified.

Passed:

- Clean `npm.cmd ci --ignore-scripts` from the project lockfile.
- `npm.cmd test`: 23 tests, zero failures/skips. Synthetic fixtures exercise submission validation, staged approval, catalog generation, image rejection/normalization, GitHub API/release/ownership failures, caching, duplicate detection and repeatable outputs.
- `npm.cmd run validate` and `npm.cmd run build` on the deliberately empty production catalog.
- Full `npm.cmd audit`: zero reported vulnerabilities in production or development dependencies.
- Actionlint v1.7.12: all five GitHub Actions workflows accepted. The local verifier was downloaded from the official actionlint release and checked against its published SHA-256 manifest; it is ignored under `.cache/`, not a project dependency.
- Two successive production catalog builds were byte-identical. SHA-256 of `dist/catalog.json`: `5399c6597ab50cc53c7a078a6458562486a4fcc272ef0522d4aba3cff5d9ffbb`.
- Nonempty fixture catalogs and normalized WebP images also matched across repeat builds.

Not verified:

- GitHub-hosted issue events, comments, moderator environment approval, PR creation, dispatched CI, protected-branch merge, scheduled runs and artifact upload. They require a configured remote repository; see README.md.
- An actual community-approved project's repository/release/images. No approved project was supplied; synthetic fixture records remain outside production.
- Linux runner execution or cross-platform binary image equivalence. The offline catalog copies committed image bytes; only identical-input builds on the tested platform were measured.
- Software safety, archive contents, copyright or submitter authority beyond owner/public-organization affiliation. Those remain moderator responsibilities.

Maintenance refreshes create reviewable PRs and a diagnostic artifact. Merge persists the new metadata; no direct-push bypass or automatic merge was configured.
