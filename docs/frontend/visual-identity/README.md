# LOG-HUB-004C: Legacy of Goku visual identity

Review candidate based on PR #26 at ba2049be21e8d88cd0c277a59f8b62f2acd5d2f1. PRs #24, #25 and #26 remain unmerged. No Pages enablement, deployment, production listing approval, upstream project modification, persistent ratings or framework/dependency change is part of this milestone.

## Art direction and shared implementation

Inspected both supplied references at their original resolution: `C:\Dev\Legacy of Goku Hub Dashboard-1.png` (homepage) and `C:\Dev\Legacy of Goku II Enhanced Hub-2.png` (detail). They guide the visual language, not exact geometry or content. The installed frontend-design guidance was used with the owner-approved direction; no replacement concepts were generated.

Retained Barlow Condensed + Inter, the polished heading spacing and wordmark sizes, the LoG II palette, Astro static build and existing catalog source. The reusable treatments are:

- Gold-edged frames with dark inset lines and restrained six-pixel corners across the hero, cards, artwork and information panels.
- Navy menu surfaces, warm gold selection states, visible keyboard focus and compact category/status badges.
- A framed featured spotlight with artwork, real game/category/status identification, community rating and primary/secondary actions. Its description shows up to four lines; the complete text remains in the detail page's About section.
- A subtle blue grid behind the distinct community-rating display and unsaved individual selector. Canonical Dragon Ball star arrangements are untouched.
- A warm reading surface in About, with dark text for contrast. Additional metadata and useful links retain their single display locations. Empty sections remain omitted.
- Primary download actions for available released projects; a primary repository action for unreleased projects and resources. Mobile actions stack with full readable labels.

Tokens in `website/src/styles/tokens.css`: `--frame-gold`, `--frame-highlight`, `--frame-shadow`, `--frame-radius`, `--frame-inset`, `--panel-fill`, `--menu-fill`, `--menu-grid`, and `--reading-surface`. They derive from the existing palette rather than adding unrelated colors. Shared rules live in `website/src/styles/identity.css` after the existing layout/typography sheets.

`Scenery.astro` supplies ambient, noninteractive game scenery. `ProjectArtwork.astro` supplies consistent cover sizing and a neutral unavailable-artwork message after an image error. The component handles both an error event and an already-failed image, preserving navigation and metadata. It never invents a cover URL or weakens submission validation. A visual pass caught and fixed an inherited aspect ratio that enlarged narrow card artwork beyond its container; a browser regression now checks that boundary.

## Authentic game art and scaling

During implementation the owner explicitly authorized authentic trilogy game assets, replacing the initial original-only scenery constraint, and emphasized correct site scaling. The final candidate uses the unmodified 256 x 256 **Canyon** background from **Legacy of Goku II**, credited by [Sprite Database](https://spritedatabase.net/file/2915) to **Son Gohan**. The 22,755-byte PNG is self-hosted through Astro/Vite. Source URL, game identity, dimensions, size and SHA-256 are recorded in `website/src/assets/sources.json`; [asset credits](../../../website/src/assets/CREDITS.md) distinguish it from original Hub code/art.

Desktop scenery displays at 512 x 512 (2x) and mobile scenery at 256 x 256 (1x), with `image-rendering: pixelated`. Aspect ratio is never stretched. CSS fades scenery toward the content and reduces opacity on mobile. It cannot intercept input or enter the accessibility tree. There is no animation, parallax, external runtime asset request or ROM distribution. Forced-colors mode hides scenery.

Project artwork remains separate. The three inspected disassembly banners are retained. DragonByte's explicit neutral preview placeholder remains; the two obsolete screenshots are still excluded. Authentic site scenery does not imply that any repository has supplied a new cover or a release.

## Differences from the concepts

The provided concepts include character illustrations, fictional game listings, release versions, screenshots and rating aggregates. None of that content was imported into real project records. The candidate uses actual banners, the SDK placeholder, no-release states and unrated displays. Synthetic released ROM-hack data remains isolated in the existing fixture build.

Frames and controls are simpler than the heavily embellished concept borders, preserving legibility at 320px and keeping rendering inexpensive. The real game background supplies atmosphere around content rather than becoming a full-brightness wallpaper. Description deduplication is preserved instead of reproducing repeated concept copy. Release data stays in Project Details, with no duplicate release panel. Galleries appear only when actual catalog screenshots exist. No decorative swooshes were reintroduced.

## Matching evidence

Fresh baseline captures used the unchanged PR #26 real and fixture builds. After captures use the same catalog inputs and viewports. Desktop is 1448 x 1086; mobile is 390 x 844 and 320 x 844. Mobile images include the full page, so total image heights vary with reflow.

| View | PR #26 baseline | New identity |
|---|---|---|
| Desktop homepage | [Before](evidence/before/homepage-desktop.png) | [After](evidence/after/homepage-desktop.png) |
| 390px homepage | [Before](evidence/before/homepage-mobile.png) | [After](evidence/after/homepage-mobile.png) |
| 320px homepage | [Before](evidence/before/homepage-mobile-320.png) | [After](evidence/after/homepage-mobile-320.png) |
| Desktop LoG II detail | [Before](evidence/before/detail-desktop.png) | [After](evidence/after/detail-desktop.png) |
| 390px detail | [Before](evidence/before/detail-mobile.png) | [After](evidence/after/detail-mobile.png) |
| 320px detail | [Before](evidence/before/detail-mobile-320.png) | [After](evidence/after/detail-mobile-320.png) |
| Released ROM-hack fixture desktop | [Before](evidence/before/released-desktop.png) | [After](evidence/after/released-desktop.png) |
| Released ROM-hack fixture mobile | [Before](evidence/before/released-mobile.png) | [After](evidence/after/released-mobile.png) |

Actual renders were inspected, including authentic scenery scaling, card image containment, long titles, warm reading surfaces, no-release layouts, a released fixture and the empty catalog. Owner visual approval remains outstanding.

## Verification and limits

The complete existing 77-test Node suite passed. The new credited-image integrity/decode test passed separately; all eight targeted site tests passed. Real-preview and fixture browser suites passed 17 and 28 cases, including automated accessibility checks with zero violations, responsive layouts from 320 to 1448px, search/filter/sort, keyboard/touch controls, metadata deduplication, safe text, missing artwork, no releases and empty catalogs. After the final small mobile-action adjustment, 27 affected capture, accessibility, responsive and detail tests passed again. An empty-state screenshot review exposed an older local production-artifact preview on port 4322. The confirmed local helpers were stopped, both Playwright configs now require fresh servers, and the empty-state test asserts fixture provenance. The full fixture suite was then rerun against the correct build. This fixes test isolation without changing any deployed service.

Local performance evidence is in [real-page metrics](evidence/after/performance.json). The real homepage transferred about 248 KB and LoG II detail about 184 KB, including local fonts, images, styles and scripts. Script transfer was about 2.0 KB / 1.3 KB respectively; all requests were local. Existing fixture budgets (under 400 KB total / 30 KB scripts) also passed. These are loopback measurements, not hosted or throttled-device performance claims. The unchanged catalog JSON was compared against isolated input, and all 21 files had identical hashes across repeated static builds.

Production submission, ownership, policy, publishing and recovery code is unchanged. Frontend validation continues to require approved artwork; the fallback handles delivery failures only. No community projects were approved, no owner-wide trust was granted and no remote preview or public site was deployed.

Windows commands, with existing isolated input and browsers:

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
$env:PLAYWRIGHT_BROWSERS_PATH = '.cache/playwright'
npm.cmd run site:real
npm.cmd run test:site
npm.cmd test
npx.cmd playwright test --config playwright.real.config.js identity.pw.js
npm.cmd run site:fixture
node tools/site/build.js --fixture --empty
node tools/site/build.js --fixture --unfeatured
npm.cmd run test:browser
```

Use `IDENTITY_PHASE=before` only to capture an unchanged baseline before implementing another revision. Current captures default to `after`. Older 004A/004B evidence remains historical and is not replaced by these captures.

Physical-device and screen-reader testing remains unverified. Automated accessibility scans do not replace those checks. Final approval requires the owner to review the rendered screenshots before merging.
