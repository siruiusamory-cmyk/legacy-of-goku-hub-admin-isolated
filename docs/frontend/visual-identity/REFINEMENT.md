# LOG-HUB-004C final refinement

PR #27 remains a stacked, unmerged review candidate. No deployment, Pages, production listing, trust, publishing or recovery changes are included.

The final owner-selected scenery uses LoG I Kame House, LoG II Goku's House (East District 439 Autumn), and Buu's Fury Snake Way. It follows the displayed project's game, or the featured project on the homepage. Multiple-game and empty views remain neutral. Each page renders one image once, without tiling, mirroring or duplicate scenery layers. Native mobile and 2x desktop pixel scaling preserve aspect ratio; horizontal and vertical masks protect text and blend the lower edge. This supersedes the earlier Canyon selection; its original file and provenance remain preserved in source. Featured content has the strongest framing; cards and ordinary information panels use restrained navy borders. The featured artwork and copy share one composition. Its summary ends at a complete sentence, with View Project leading to the full About description. Filters retain their complete labels at 320px and use separate rows where tablet space requires them. Typography and palette are unchanged.

## Portrait frame correction

The owner-requested Buu's Fury frame is split into a tiny plain-edge PNG and a second transparent ornament PNG. The background and portrait interior were cleared, including the outer corners. Panel backgrounds clip to the padding box. Four nonrepeating overlays preserve the complete inner highlight detail and keep exactly one panel centered on each side. Only the plain edge texture repeats. Homepage framing uses 2x pixels on desktop and native pixels on mobile; featured detail artwork retains 2x framing, while ordinary detail artwork uses native pixels.

The shared PortraitFrame component reaches both the homepage and project artwork. Tests verify transparent corner/interior pixels, credited hashes and palette, four centered nonrepeating ornaments, and background clipping at 320/390/760/1448px.

## Matching rendered evidence

These are actual browser captures. Desktop viewport is 1448x1086, mobile is 390x844 or 320x844, and tablet is 760x1086. Mobile/tablet captures include the full page. The original approved concepts were inspected directly; fictional artwork and metadata in those concepts were not copied into listings.

| View | Before | After |
| --- | --- | --- |
| Homepage desktop | [PNG](evidence/refinement-before/homepage-desktop.png) | [PNG](evidence/refinement-after/homepage-desktop.png) |
| Homepage 390 | [PNG](evidence/refinement-before/homepage-mobile.png) | [PNG](evidence/refinement-after/homepage-mobile.png) |
| Homepage 320 | [PNG](evidence/refinement-before/homepage-mobile-320.png) | [PNG](evidence/refinement-after/homepage-mobile-320.png) |
| Homepage tablet | [PNG](evidence/refinement-before/homepage-tablet.png) | [PNG](evidence/refinement-after/homepage-tablet.png) |
| LoG II detail desktop | [PNG](evidence/refinement-before/detail-desktop.png) | [PNG](evidence/refinement-after/detail-desktop.png) |
| Detail 390 | [PNG](evidence/refinement-before/detail-mobile.png) | [PNG](evidence/refinement-after/detail-mobile.png) |
| Detail 320 | [PNG](evidence/refinement-before/detail-mobile-320.png) | [PNG](evidence/refinement-after/detail-mobile-320.png) |
| Detail tablet | [PNG](evidence/refinement-before/detail-tablet.png) | [PNG](evidence/refinement-after/detail-tablet.png) |
| Released fixture desktop | [PNG](evidence/refinement-before/released-desktop.png) | [PNG](evidence/refinement-after/released-desktop.png) |
| Released fixture mobile | [PNG](evidence/refinement-before/released-mobile.png) | [PNG](evidence/refinement-after/released-mobile.png) |
| Empty desktop | [PNG](evidence/refinement-before/empty-desktop.png) | [PNG](evidence/refinement-after/empty-desktop.png) |
| Empty 390 | [PNG](evidence/refinement-before/empty-mobile.png) | [PNG](evidence/refinement-after/empty-mobile.png) |
| Empty 320 | [PNG](evidence/refinement-before/empty-mobile-320.png) | [PNG](evidence/refinement-after/empty-mobile-320.png) |

Real repository previews remain isolated, unapproved, unrated and without releases. DragonByte retains its neutral placeholder. Released fixtures are synthetic tests only. Descriptions, badges, actions, missing-data behavior and detail deduplication remain intact. No obsolete DragonByte screenshots are used.

## Provenance and boundaries

[Credits](../../../website/src/assets/CREDITS.md) and [source manifest](../../../website/src/assets/sources.json) record sources, contributor attribution, hashes, crop coordinates, processing and sizes. The three scenery crops are 25,397 / 31,496 / 25,123 bytes; both frame PNGs together are 930 bytes. The complete portrait sheet is not shipped. No new dependency, font, animation, network service or AI runtime was added.

Redistribution permission from the original rights holders remains **unverified**. The owner explicitly required keeping Canyon in the build after this was raised, and requested the authentic portrait frames. Attribution, noncommercial use and owner instructions are not represented as a rights-holder license.

## Verification

The full Node regression suite passed 81 tests. Full real-preview and fixture browser suites passed 20 and 28 cases, including automated WCAG checks with zero violations, search/filter/sort, metadata deduplication, safe untrusted text, keyboard/touch ratings, missing artwork, unavailable releases and empty catalogs. The final centering adjustment receives a targeted 14-case capture, responsive, frame geometry, keyboard and accessibility rerun. A repeated real-preview static build produced identical SHA-256 values for all 25 output files. Generated catalog JSON deep-equals the original isolated real-repository input. No diff exists in backend source, policy, schema, workflows, tooling or dependency manifests.

[Local performance measurements](evidence/refinement-after/performance.json) show approximately 229 KB homepage and 197 KB detail transfers, including fonts and artwork, with about 2.0 KB and 1.3 KB script transfer. All requests were local. These are loopback measurements, not hosted or throttled-device claims.

The [independent Zeroshot report](ZEROSHOT-REFINEMENT.md) returned **technical PASS**, with no blocking defect. It inspected the actual diff, all 26 matching captures and both approved concepts, and independently ran five targeted tests. Its two documentation findings are resolved by this report and corrected frame-scaling credits. Subsequent owner amendments (game-specific scenery and unnumbered rating balls) receive one focused follow-up review, recorded in the same report. Scenery now includes a vertical fade; the tablet placeholder still occupies a large portion of the first screen. Final visual acceptance belongs to the owner.

Physical-device and screen-reader testing, hosted performance and legal redistribution clearance remain unverified. No PR was merged and no site was deployed.

## Reproduce locally on Windows

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
$env:PLAYWRIGHT_BROWSERS_PATH = '.cache/playwright'
$env:IDENTITY_PHASE = 'refinement-after'
npm.cmd test
npm.cmd run site:real
npx.cmd playwright test --config playwright.real.config.js
npm.cmd run site:fixture
node tools/site/build.js --fixture --empty
node tools/site/build.js --fixture --unfeatured
npx.cmd playwright test
```

Real preview requires the existing isolated `.review/004a/real-input`; it is not a production publishing source. Browser tests require fresh loopback servers and their configured ports to be available. Preserve historical 004A/004B evidence when recapturing current refinement evidence.

The rating selector no longer shows numbers beneath the balls. Star patterns identify the visible scale; screen-reader labels, native radio keyboard operation and the unsaved selection announcement remain. No persistent rating behavior changed.

Additional per-game captures are in refinement-after: legacy-of-goku-{320,390,760,1448}.png, legacy-of-goku-2-{320,390,760,1448}.png and buus-fury-{320,390,760,1448}.png. Each verifies the actual game-specific background and a single nonrepeating image.

The final rating polish centers each ball within its selection target and centers all seven desktop ball centers on the exact horizontal midpoint of the complete rating panel. The preview status stays in the text column so it cannot reserve an extra row beneath the scale. A browser geometry assertion measures every desktop ball center against the panel midpoint with less than 0.02 CSS pixel tolerance, and checks individual target centering at all four viewport widths. Source crop pixels were independently compared to the local supplied sheets and matched exactly; PNG palette optimization did not alter their colors.

Focused Zeroshot follow-up 01a1df3b-d771-7a22-90f2-ed4f042611ab also returned technical PASS with no blocking defect. It independently compared all source-crop pixels, inspected the updated per-game screenshots, checked original portrait derivation and reran six targeted Node tests. The subsequent exact panel-center CSS correction passed the final 14 targeted browser checks; it did not trigger a third independent review.

## Detail artwork fill correction

Restored the exact pre-request frame CSS dimensions from 615688a: 276px at desktop/tablet and the original responsive 16:9 mobile frame, with original grid width and placement. Only the image inside uses fill sizing. A build-time detail-only derivative removes the normalization matte before display, so the visible banner fills the entire existing frame interior. Proportional cover sizing fills the interior without stretching. Excess banner width is cropped with a left-biased focal position to retain the game logo; the right-side beam and small banner caption may be cropped. Canonical 640x360 catalog covers, cards, submitted records, scenery, ratings and security policy remain unchanged. The frame is not resized to the banner.

The new bounded Sharp helper accepts normalized static covers only and emits lossless detail WebP images plus build-local dimensions. Source catalog JSON remains unchanged. New coverage checks padding removal, full-size covers, pixel preservation and rejection of unexpected dimensions. All 82 Node tests passed; full 20 real and 28 fixture browser cases passed for the derivative implementation before the final frame-CSS restoration. After restoration, five real capture/accessibility cases passed, the corrected frame-geometry assertion passed separately, and seven fixture capture/accessibility cases passed. Geometry verifies original frame dimensions, an unpadded banner, all four inner edges filled, centered ornaments, and exact rating-panel alignment. Updated desktop/mobile/tablet evidence is included. The two earlier Zeroshot reports precede this owner-directed artwork correction; no third review loop was run.

The latest visual polish replaces stretched fill with proportional cover sizing, with a 6% horizontal focal point for the wide disassembly banners. Frame dimensions and placement remain exactly at the pre-request values. Six real-preview and seven fixture capture/accessibility cases passed; desktop and mobile renders were inspected. No additional independent review loop was run for this CSS-only adjustment.

Owner follow-up: LoG II detail crops are now centered (50% / 50%) inside the original frame. A game metadata selector scopes this change to LoG II; LoG I and Buu's Fury retain the existing 6% horizontal focal position. Frame dimensions, padding removal, scenery and ratings are unchanged. Current preview detail URLs are /projects/gh-1432341427/ (LoG I), /projects/gh-1429374563/ (LoG II), and /projects/gh-1398951057/ (Buu's Fury). Browser verification uses a separate loopback port so the owner's running preview on4325 remains available.

Final logo-centering correction supersedes the prior whole-banner centering: all three disassembly images now use explicit logo-region crop rectangles in website/src/assets/art-direction.json, each pinned to its canonical source-cover SHA-256. The helper applies a rectangle only when the actual source bytes match; changed artwork falls back to the normal padding trim instead of receiving a stale crop. Proportional centered cover sizing positions each title logo inside the existing frame. Frame dimensions and placement remain untouched. Unit coverage verifies correct crop dimensions and stale-hash fallback; all 12 site tests and six responsive/accessibility/frame browser cases pass. Source images, canonical covers, project records, backgrounds and rating behavior remain unchanged.

Rating copy cleanup: the selector now renders only Rate this project and the seven balls. Removed instructional/status paragraphs and their unused change-announcement handler/styles. Numeric names use aria-label attributes rather than DOM text, and the group references its heading. Native keyboard interaction and pageshow reset remain; no persistent voting was added. Desktop geometry tests verify both heading and all ball centers coincide with the rating panel midpoint. Responsive mobile stacking remains. Updated screenshots cover all three detail pages and released fixtures. Six real-preview and eight fixture/browser capture, keyboard and accessibility checks passed.
