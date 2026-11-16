# Verification : self-service milestone

Environment: Windows x64, Node.js 24.16.0, npm 11.13.0. Repository: `C:\Users\hears\log-hub-pipeline`. No remote, GitHub settings change or deployment. Local Codex MCP cleanup was explicitly authorized separately.

The initial 23-test baseline was run before changes and passed. Those regression assertions remain, including the legacy JSON parser and approval path. The old form test now reads the archived legacy form, since the active form is intentionally guided; its original assertions were retained. New tests separately check both active forms contain no JSON textarea.

Measured checks:

- `npm.cmd test`: **47 passed**, zero failed or skipped.
- `npm.cmd run validate` and `npm.cmd run build`: pass on deliberately empty production records.
- `npm.cmd audit`: zero reported dependency vulnerabilities; no application dependencies were added for this milestone.
- Actionlint v1.7.12: all five workflows accepted.
- New self-service fixture builds compare byte-identical catalogs, registry snapshots and normalized cover assets across runs.
- The original nonempty fixture catalog/image determinism assertions also pass.
- New issue forms, policy schemas, manifest schemas, bounded GitHub mocks and artifact provenance/permission boundaries are covered by executable tests.

Coverage includes manifest discovery/version/size/schema/path restrictions; guided fields producing the same internal record; trusted/untrusted owners; approved third-party digest binding; unclaimed projects and real-owner claims; organization representatives versus membership; automatic metadata/release changes; sensitive attribution review; transfers/renames; revocation/suspension/delisting; duplicates; API failures/rate limits; image/download failures; claim retention; snapshot recovery; interrupted publishers; feedback failure and guided-source rollback. Fixtures remain outside production records and are clearly synthetic.

Independent development-time review and its limits are detailed in [docs/ZEROSHOT-REVIEW.md](docs/ZEROSHOT-REVIEW.md). Three source-review cases were reproduced as failing coordinator tests before repair. A fourth coordinator-found legacy migration failure also had a failing regression before repair. The final typed independent source review inspected all four repairs and reported **no remaining confirmed findings in reviewed changes**, with zero error-level log records. Independent agents did not run executable tests. This verdict is scoped source evidence, not runtime certification or a conclusion inferred from graph completion.

Not verified: Linux runner execution, GitHub-hosted end-to-end events and artifact lifecycle, real account permissions/branch rules, actual community-project integration, cross-platform encoder equality, archive contents/ROM absence, licensing or malware safety. No real approved community project was supplied. These are not inferred from fixtures or static workflow checks.

The previous milestone's report is archived at [docs/VERIFICATION-V1.md](docs/VERIFICATION-V1.md).
