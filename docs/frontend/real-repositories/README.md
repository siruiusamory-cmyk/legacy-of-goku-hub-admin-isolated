# LOG-HUB-004A: isolated real-data preview

This is an unapproved review preview, not the production catalog. PR #24 remains open and unmerged. No Pages deployment or upstream repository modification is authorized by this preview.

## Inspected repository evidence

All four inspected repositories were public, owner ID 287528505, default branch `master`, with no GitHub Releases and no root `.loghub.json`. The exact source observations are pinned in [the proposal plan](../../../proposals/log-hub-004a/repositories.json) and [read-only verification](verification.json). New upstream commits require fresh inspection before updating that plan; these are source snapshots rather than a claim about future repository state.

| Project | Repository ID | Category / game | Source commit |
|---|---:|---|---|
| DragonByte Z / Webfoot SDK | 1429329775 | Tool / multiple games | fc8752ee08cff43545c25ccd755db561fec6a630 |
| Legacy of Goku Disassembly | 1432341427 | Resource / LoG I | 53daea5dce101411f42575d4efda0488273de3fb |
| Legacy of Goku II Disassembly | 1429374563 | Resource / LoG II | 55363351468719fff9650cad45d81011da1f9438 |
| Buu's Fury Disassembly | 1398951057 | Resource / Buu's Fury | 91d367a9b81de83c80dc8da35f13db6b54696c80 |

Descriptions are based on inspected repository descriptions, READMEs and documentation. These projects are in development; the disassemblies are source reconstruction resources, not playable ROM hacks. No releases, downloads, ratings, progress percentages or team representation are invented. Account control is established by numeric identities; it is not proof of authority to represent a team. All listings remain unclaimed in this preview. The featured SDK is a local preview choice, not a production feature decision.

## Artwork

Each disassembly's `docs/banner.png` was inspected at its original 1800 x 450 resolution and names the corresponding project. The existing Sharp normalization pipeline produces optimized 640 x 360 WebP covers with aspect ratio preserved and letterboxing.

DragonByte Z's `public/dbz-layout-editor.png` and `public/dbz-map-browser.png` are obsolete. Neither is fetched or used by preview ingestion. Current repository assets did not establish a suitable replacement: unimplemented editor design diagrams, background art and small interface icons are not current application screenshots. Its clearly labeled neutral placeholder is generated locally and normalized for this preview only. There are no screenshots for these four projects, so detail pages omit that section.

Production manifest and guided validation still require a genuine repository-hosted cover. Both normal submission paths reject the incomplete SDK submission. The smallest remedy is owner-approved current artwork committed to that repository, followed by a complete manifest. The SDK draft is deliberately named `manifest-incomplete.json` rather than `.loghub.json`.

The two obsolete images are separate upstream cleanup candidates. A bounded read-only scan checked 1,474 tracked files at the inspected SDK commit, skipping none. References include application project data, layout Open Graph metadata, ROM safety documentation, source classification, a CI test, design decisions and historical README. Exact paths/lines are in [the reference scan](../../../proposals/log-hub-004a/obsolete-art-reference-scan.json). An eventual separate cleanup PR must update those references and test expectations before deleting files. No upstream cleanup was performed here.

## Submission and publication boundary

The real GitHub API resolved repository IDs, owner, default branches, source commits, descriptions, root manifest absence and release absence. Proposed manifest metadata and locally constructed guided form events pass the same internal record validation for the three banners. No hosted submission issue was created, and no manifest was installed upstream. The publisher used an empty trust/approval policy and correctly retained new submissions for review; the output catalog was empty until a separate local frontend preview was assembled. The fourth SDK entry exists only in that isolated preview.

Proposed manifests and exact-ID approval entries live under `proposals/log-hub-004a/`. They are review material only, not active policy. The three disassembly approval proposals grant no owner-wide trust. The SDK approval is blocked pending suitable artwork. Production policy, schemas, workflows, protected publishing and signed recovery are unchanged. The deployment guard rejects a `real-preview` marker.

## Run on Windows

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
npm.cmd ci --ignore-scripts
$env:PLAYWRIGHT_BROWSERS_PATH = '.cache/playwright'
npx.cmd playwright install chromium
npm.cmd run site:real:ingest
npm.cmd run site:real
npm.cmd run test:real
$env:PORT = '4325'
$env:SITE_SERVE_DIR = (Resolve-Path '.site/real-preview').Path
npm.cmd run site:serve
```

Ingestion uses existing `gh` authentication in memory for GET requests only and fails if inspected identities, source commits or descriptions changed. Reinspect changed upstream content rather than editing the checks away. The generated input is ignored under `.review/004a/real-input`; the built site is `.site/real-preview`, never production. No development fixture or preview is eligible for production deployment.

## Detail page cleanup and verification

The shared template covers tools, resources, unreleased projects and released ROM hacks. The complete description appears only in About. Hero badges carry game/category/status once; actions carry the repository and available download once. Project Details carries release version/size/date, last updated and representation information where available. Additional Links deduplicates destinations already shown and repeated entries. Empty galleries and link sections disappear, and release information has no separate empty panel. Availability warnings, attribution, checksums and both distinct rating functions remain. No persistent voting is enabled.

Deleted both decorative CSS pseudo-elements under branding and beside the featured title, including their gradients. Other palette, borders, buttons, stars and accents are preserved. Gallery panels no longer stretch to fill unrelated metadata height.

Actual local results after cleanup: 76/76 Node regressions, 27/27 fixture browser tests and 11/11 real-preview browser tests. Seven added fixture checks cover one-location detail information and unique external destinations. Four real detail accessibility scans and existing desktop/mobile WCAG scans returned zero automated violations. Keyboard navigation, unsaved rating selection, search, category/game filtering, sorting, stable detail routes, no-download handling, safe text rendering, image loading and viewport overflow checks passed. Real pages were checked at 320, 390, 760 and 1448 pixels; fixture pages also at 430, 941 and 1024. Automated accessibility checks do not replace human assistive-technology testing.

Captured and inspected desktop/mobile homepages and all four real detail pages, plus released ROM-hack fixture details. Repeated real-preview builds were byte-identical across all 15 generated files. All four real detail screenshot pairs are included below. No claim of public hosted frontend deployment is made. The existing regression capture also retains local static payload/performance checks; no new hosted performance benchmark was run.

- [Desktop homepage](evidence/homepage-desktop.png) / [mobile homepage](evidence/homepage-mobile.png)
- [LoG II desktop](evidence/legacyofgoku2-disasm-desktop.png) / [mobile](evidence/legacyofgoku2-disasm-mobile.png)
- [LoG I desktop](evidence/legacyofgoku-disasm-desktop.png) / [mobile](evidence/legacyofgoku-disasm-mobile.png)
- [Buu's Fury desktop](evidence/buusfury-disasm-desktop.png) / [mobile](evidence/buusfury-disasm-mobile.png)
- [DragonByte desktop](evidence/dragonbyte-z-desktop.png) / [mobile](evidence/dragonbyte-z-mobile.png)

Independent review is recorded in [REVIEW.md](REVIEW.md). Owner approval of artwork, listings, visual changes, merging and eventual deployment remains outstanding.
