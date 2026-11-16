# LOG-HUB-004B: typography review candidate

Based on PR #25 at 21ab40ec1d82891c46cd1d00d86986cd9de94bc4. This is the first typography implementation; the prior frontend used Arial. No production policy, catalog entries, artwork, persistence, deployment gates or recovery behavior changed.

## Hierarchy and tokens

Shared tokens are in `website/src/styles/tokens.css`; `typography.css` applies them after existing layout styles.

| Role | Font | Weight / style |
|---|---|---|
| Featured titles and branding | Barlow Condensed | 700 italic |
| Section headings, cards and ordinary detail titles | Barlow Condensed | 700 upright |
| Navigation, buttons, filters, badges and controls | Inter | 600 upright |
| Descriptions, metadata, body and entered search text | Inter | 400 upright |

`--font-body/display` provide system fallbacks. `--weight-body/ui/display` are 400/600/700. Body size is 1rem with 1.5 leading; headings use 1.08 leading and .012em tracking, with .018em for panel headings and mobile detail titles. Interface leading is 1.35 with zero tracking. Title size is clamp(2rem, 3.2vw, 3rem); section size clamp(1.625rem, 2.3vw, 2rem); card size clamp(1.25rem, 1.8vw, 1.625rem); panel size is 1.5rem, reduced to 1.4375rem on mobile. Existing grids, surfaces, colors and actions remain. Unrelated directory-copy and rating-value italics are removed. Artificial weight/style synthesis is disabled.

Hero titles wrap naturally. The ordinary LoG II title is upright; the featured DragonByte title is italic. The neutral placeholder is existing image content, not live typography, and remains unchanged.

## Fonts and licensing

Barlow's author project is [jpt/barlow](https://github.com/jpt/barlow); Bold and Bold Italic TTFs came from the official [Google Fonts distribution](https://github.com/google/fonts/tree/main/ofl/barlowcondensed). Inter Regular and SemiBold came from the author's [official distribution](https://rsms.me/inter/), version 4.1.

Both distributions use SIL Open Font License 1.1. Full copyright/license notices remain in `website/src/fonts/BARLOW-OFL.txt` and `INTER-OFL.txt`, and are embedded in each subset's OpenType name ID 13. Original copyright metadata remains intact. The supplied notices declare no Reserved Font Name after their copyright statements. These assets remain OFL-licensed; the website's own content is separate.

Only four static Latin WOFF2 styles are shipped. No additional weights, variable axes or Inter italics are included. Common punctuation/currency glyphs are retained; other scripts use system fallback. `font-display: swap` keeps text readable while loading. Astro/Vite emits hashed local assets; pages contact no font provider. The loopback server sends `font/woff2`.

Total font payload: 85,596 bytes, about 83.6 KiB. Exact URLs, source/subset SHA-256 hashes, file sizes and FontTools version are in `website/src/fonts/sources.json`. Existing FontTools and Brotli were used; no software or npm dependency was installed. These tools are not needed to build or operate the site.

The preparation recipe used TTFont and fontTools.subset, retained original timestamps, emitted WOFF2 and embedded the corresponding full OFL notice as Windows English name ID 13. Subset ranges: `U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD`. Updates require source/license inspection, refreshed hashes and browser checks.

## Matching screenshots

Fresh before captures used unchanged PR #25 output before fonts or CSS changed. After captures use identical data and viewports: desktop 1448 x 1086; mobile 390 x 844. Desktop images show that viewport; mobile images capture full scrollable content, so their total image heights differ after reflow. Captures await images and loaded fonts.

| View | Before | After |
|---|---|---|
| Desktop homepage | [Before](evidence/before/homepage-desktop.png) | [After](evidence/after/homepage-desktop.png) |
| Mobile homepage | [Before](evidence/before/homepage-mobile.png) | [After](evidence/after/homepage-mobile.png) |
| LoG II desktop detail | [Before](evidence/before/legacyofgoku2-disasm-desktop.png) | [After](evidence/after/legacyofgoku2-disasm-desktop.png) |
| LoG II mobile detail | [Before](evidence/before/legacyofgoku2-disasm-mobile.png) | [After](evidence/after/legacyofgoku2-disasm-mobile.png) |

All four rendered after views were inspected against baseline. Headings now have an upright hierarchy with selective display italics. Inter descriptions use more open leading, increasing vertical space instead of truncating text. The LoG II title fits one line at 390px; longer technical titles wrap without overflow. Historical 004A evidence remains unchanged. Visual approval remains the owner's decision.

## Verification

- All 76 existing Node tests passed; the new WOFF2/hash/license test passed independently.
- All 27 fixture browser cases passed, including responsive widths 320 through 1448px, navigation, safe text, deduplicated details, empty catalog and accessibility checks.
- All 13 real-preview browser cases passed: existing 11 plus matching screenshots and loaded-font/style assertions. After embedding license metadata, the two typography cases passed again against rebuilt assets.
- All four font requests returned 200 from loopback; all four FontFace entries loaded. Computed styles confirmed Inter 400 body, 600 controls, Barlow 700 italic featured title and 700 upright card/section headings.
- Long technical titles passed at 320, 390, 760 and 1448px, including an inserted ARM/Thumb reconstruction title in the browser DOM, without altering catalog data.
- Automated accessibility scans returned zero violations for all real detail pages and existing fixture routes. Keyboard controls and unsaved ratings remain passing.
- Swoosh removal, absent galleries/releases, single-location metadata and obsolete-art restrictions remain covered. Publishing/recovery source and policy are unchanged.

Windows commands, with existing isolated real input:

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
$env:PLAYWRIGHT_BROWSERS_PATH = '.cache/playwright'
npm.cmd run site:real
npm.cmd run test:real
node --test tests/site/typography.test.js
npm.cmd test
npm.cmd run site:fixture
node tools/site/build.js --fixture --empty
node tools/site/build.js --fixture --unfeatured
npm.cmd run test:browser
```

Owner visual review is outstanding. No physical-device or screen-reader validation was performed; automated scans are not a substitute. Non-Latin fallback appearance depends on platform fonts. No live repository refresh was needed for typography. PR #24, #25 and the typography PR remain unmerged. No Pages deployment, production listing modification or persistent voting was performed.

## Final typography polish

The Barlow Condensed + Inter direction is owner-approved. This small follow-up adjusts heading readability and wordmark prominence only; final screenshot approval remains pending.

- Shared heading tracking increases from .005em to .012em. Panel headings and mobile detail titles use .018em.
- Mobile detail titles increase from 32px to 34px, and smaller panel headings from 22px to 23px. Ordinary headings stay upright; featured titles stay selectively italic.
- Wordmark size increases from 30px to 32px at the desktop reference width, from 22px to 25px at 390px, and from 20px to 22px at 320px. The existing icon, colors and italic font are unchanged.
- No unrelated layout, copy, images, controls, production data, fonts or dependencies changed.

Fresh comparison captures preserve the initial PR #26 state in `evidence/polish-before/` and the refinement in `evidence/polish-after/`. All six updated views were inspected, including both pages at native 320px and 390px mobile widths. The original before/after screenshots remain as the first implementation's historical evidence.

| View | Initial PR #26 | Refined |
|---|---|---|
| Desktop homepage | [Before](evidence/polish-before/homepage-desktop.png) | [After](evidence/polish-after/homepage-desktop.png) |
| 390px homepage | [Before](evidence/polish-before/homepage-mobile.png) | [After](evidence/polish-after/homepage-mobile.png) |
| 320px homepage | [Before](evidence/polish-before/homepage-mobile-320.png) | [After](evidence/polish-after/homepage-mobile-320.png) |
| Desktop LoG II detail | [Before](evidence/polish-before/legacyofgoku2-disasm-desktop.png) | [After](evidence/polish-after/legacyofgoku2-disasm-desktop.png) |
| 390px LoG II detail | [Before](evidence/polish-before/legacyofgoku2-disasm-mobile.png) | [After](evidence/polish-after/legacyofgoku2-disasm-mobile.png) |
| 320px LoG II detail | [Before](evidence/polish-before/legacyofgoku2-disasm-mobile-320.png) | [After](evidence/polish-after/legacyofgoku2-disasm-mobile-320.png) |

Verification: seven targeted Node site tests passed. All 14 real-preview and all 27 fixture browser tests passed, including automated accessibility scans with zero violations, responsive overflow, navigation, detail deduplication and unsaved ratings. The new narrow-header check verifies wordmark size, no clipping/wrapping, menu separation and title fit at 320/390px. Screenshot capture uses the same desktop/mobile viewport dimensions as the initial candidate, plus 320 x 844. Run with `$env:TYPOGRAPHY_PHASE = 'polish-after'` before `npm.cmd run test:real` to regenerate the polish evidence rather than the original captures.

Only final owner visual acceptance remains. Physical-device and screen-reader validation were not repeated. All three PRs remain open and unmerged; nothing is deployed.
