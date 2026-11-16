# LOG-HUB-004: approved design implementation

The Astro frontend PRs #24–#27 and moderation #28 are integrated into main; the website is not deployed. Follow the current [launch report](../launch/README.md) and [deployment checklist](../launch/DEPLOYMENT.md). Historical verification below records the frontend milestone; its former merge/review status is superseded by LOG-HUB-008. Current visual details are recorded in the [typography](typography/README.md) and [visual refinement](visual-identity/REFINEMENT.md) reports.

## Architecture and data boundary

`website/` contains Astro templates, a shared layout, cards, badges, icons, community-rating display and seven-ball preview controls. Browser JavaScript only filters/sorts existing cards and previews ratings. No React runtime, CMS, database, API server, analytics or voting service was added.

`tools/site/build.js --snapshot PATH` requires a signed recovery export. It calls the existing `verifyExport`, validates the catalog and canonical asset paths, copies only verified project images, and reapplies current suspensions/delistings. Stable identities generate `/projects/PROJECT_ID/` pages. Text uses Astro escaping; search uses DOM text/datasets, not HTML injection. Repository/download links retain existing GitHub-only validation. Optional links are HTTPS on the existing allowed hosts.

The production catalog is empty. The production site deliberately offers a submission invitation and a complete empty directory rather than invented featured games, scores, downloads or artwork. A populated catalog without an administrator-featured project uses accurate general directory copy.

Visual fixtures are explicit, isolated outputs under `.site/preview`, `.site/empty-preview` and `.site/unfeatured-preview`. They use locally authored geometric test artwork, purpose-marked provenance and illustrative names. The unfeatured variant contains the accepted 100-character title regression. Production builds cannot take these unsigned fixtures as recovery exports, and the deployment guard rejects fixture provenance. Mockup paintings, raw palettes and reference ZIP remain local and ignored, as their README requires.

## Windows commands

Use PowerShell with Node.js 24:

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run site:fixture
node tools/site/build.js --fixture --empty
node tools/site/build.js --fixture --unfeatured
$env:PLAYWRIGHT_BROWSERS_PATH = '.cache/playwright'
npx.cmd playwright install chromium
npm.cmd run test:browser
npm.cmd run site:serve
```

The browser installer uses a project-local cache. Browser tests use fresh Chromium contexts, blocked external page requests, no authenticated profile, service workers disabled and loopback-only static servers. `site:serve` binds `127.0.0.1:4321` and serves fixtures by default; it is a development command, not a service installed on the machine. Stop it with Ctrl+C.

To build the real empty production site from the existing verified export:

```powershell
npm.cmd run site:build -- --snapshot .integration/production-export
$env:SITE_SERVE_DIR = '.site/production'
$env:PORT = '4322'
npm.cmd run site:serve
```

On another machine, first obtain a signed export using the LOG-HUB-003 [operations procedure](../OPERATIONS.md). Do not substitute a raw catalog file. The pipeline and site build do not require Codex, Zeroshot or the optional development skills.

## Design system

[Palette mappings](palette-tokens.json) identify each source palette/index, exact hex value and original GPL SHA-256. Both supplied files were parsed as 256 ordered colors. Fifteen CSS base colors match these mappings; surfaces, borders and shadows use declared mixes/alpha of those colors, rather than unrelated replacement colors.

| Role | Source | Value |
|---|---|---|
| Navy | OBJ 211 | `#202040` |
| Charcoal | BG 14 | `#282828` |
| Main text | BG 2 | `#F8F8F8` |
| Muted text | BG 10 | `#B8B8B8` |
| Gold | OBJ 37 | `#F8D040` |
| Orange | OBJ 39 | `#F89018` |
| Blue | OBJ 70 | `#0068F8` |
| Deep blue | BG 105 | `#2060A8` |
| Teal | BG 69 | `#00C8C8` |
| Star red | OBJ 25 | `#D01028` |

Typography self-hosts Barlow Condensed 700 upright/italic for headings and selected branding, and Inter 400/600 for body text and interface controls. The reusable sizes, line heights and letter spacing are defined in `website/src/styles/typography.css` and documented in the [typography report](typography/README.md). There are no external font requests.

Desktop uses a 1448px maximum canvas, 36px directory gutters, 48px hero gutters, three card columns, 16px card gaps, 322px hero media, 122px card media, 16px panels and 10px controls. Layout changes at 1279, 900, 580 and 350px. Mobile stacks spotlight/media, uses two directory columns where readable, then one at very narrow widths. Filters wrap and rating touch targets remain at least 44px. No phone frame or fake operating-system status bar is implemented.

Gold gradient buttons are primary; dark bordered buttons are secondary. Blue identifies games/active filters, teal categories, green releases and violet development. Text labels carry meaning independently of color. Keyboard focus is gold with an offset. Hover/active states are modest; native disabled styling is defined. All data is static and filters are synchronous, so there is no fake asynchronous loading spinner. Reduced motion is respected.

## Rating boundary and accurate stars

Production has no rating aggregate source: it shows **Not rated yet**, never fixture scores. The selector displays only **Preview only · not saved** and seven Dragon Balls. Native radio inputs retain numeric `aria-label` names, a group named by the visible heading, and arrows/Space, pointer and touch support. The heading and balls share the desktop panel centerline. There is no instruction/status paragraph or live preview announcement. Choices remain local and unsaved: there is no submit endpoint, cookie, localStorage or aggregation, and `pageshow` resets the preview.

Star patterns were checked against the [official Banpresto seven-ball image](https://en.dragon-ball-official.com/news/01_2525.html). The source photo is local review evidence only; the website uses original SVG geometry. Two stars run upper-left to lower-right; three form a triangle; four form a square. Five uses 1-2-2 rows, six 2-3-1 with a center star, and seven a hexagonal ring plus center, 2-3-2. Every star is an upright five-point polygon. Native font glyph differences cannot change them. Unit tests check positions, count and orientation; browser tests check rendered polygon counts.

[Inspect all seven rendered balls](evidence/dragon-balls.png).

## Visual inspection and deliberate differences

All three reference PNGs were inspected at original resolution, before coding. The desktop homepage was built and visually corrected before the detail/mobile work. Desktop reference and captures are 1448x1086. The supplied mobile file is a 941x1672 phone composition; an additional capture uses a 430x764 CSS viewport with pixel ratio 941/430 to produce that same bitmap resolution, without a decorative device frame. Normal mobile/full-page captures use 390px CSS width.

| Landmark | First rendering | Corrected rendering | Reference |
|---|---:|---:|---:|
| Directory top | y=430.5 | y=425 | approximately y=425 |
| Card grid top | y=568.5 | y=563 | approximately y=563 |
| Hero media | x=48, y=82.8, 695x322 | x=48, y=80, 695x322 | approximately x=49, y=81, 700x322 |
| Card width/height | 448x256.8 | 448x250.8 | approximately 449x247 |

The final captures were inspected, not merely generated. [Before](evidence/homepage-before.png), [desktop directory](evidence/homepage-desktop.png), [desktop detail](evidence/detail-desktop.png), [mobile directory](evidence/homepage-mobile.png), [mobile detail](evidence/detail-mobile.png), [real empty desktop](evidence/empty-desktop.png), [real empty mobile](evidence/empty-mobile.png), [mobile reference resolution](evidence/homepage-mobile-reference-resolution.png).

This is a close structural translation, not pixel equality with illustrated concept art. Native filter dropdowns expose all controlled categories/statuses, and sorting uses actual name/release/update metadata instead of invented popularity. GitHub replaces an unconfigured Discord destination. No invented feature list, large screenshot count or extra long-form project description appears on details. Gallery layout follows the screenshots actually supplied. The body background does not reuse the mockup's Capsule artwork.

## Measured verification

- **73 Node tests passed**, including all original 70 regressions; none removed or weakened.
- **20 Playwright tests passed**, covering search, combined filters, sorting, reset, navigation, safe links, absent releases/screenshots, unrated projects, untrusted HTML text, keyboard/touch rating previews, no persistence, no-featured populated catalogs and screenshots.
- Seven sampled widths passed overflow checks: 320, 390, 430, 760, 941, 1024 and 1448px, including the accepted 100-character unbroken title. Reintroducing the old nowrap rule produced 4176px scroll width in a 1448px viewport; repaired rendering stayed at 1448px.
- Five axe WCAG A/AA scans passed with zero violations: desktop/mobile home/detail and mobile empty state. This is automated coverage, not complete accessibility certification or a screen-reader audit.
- Local project-base-path tests passed home, detail, assets, filtering and return navigation under `/legacy-of-goku-hub/`, with no missing resources.
- A real signed production export built successfully. Two repeated production builds produced byte-identical hashes for all seven output files.
- [Performance evidence](evidence/performance.json) records zero external page resources, about 150KB transferred for the fixture homepage including HTML, 79KB detail and 36KB empty homepage, with approximately 1.5KB homepage JavaScript and 0.8KB detail JavaScript. These are localhost Chromium measurements, not Lighthouse scores, throttled mobile benchmarks or field Core Web Vitals.
- npm reported zero dependency vulnerabilities after installation. New dependencies are development-only Astro, Playwright and axe; backend runtime dependencies remain Ajv and Sharp.

The bounded [independent review](REVIEW.md) inspected code, all original mockups, actual screenshots, palette hashes and the official star reference. It found two confirmed edge cases, now repaired with regression coverage. Closure passed. Reviewers did not access credentials, change files, merge or deploy.

## Deployment readiness and owner approval

The existing catalog workflow retains its protected synchronize/backup/receipt/publish stages. An appended read-only website job runs **after successful catalog publication**, exports the newest protected recovery point using a backup App token reduced to read, verifies/builds the static site and uploads a separate `website` artifact. It checks the source revision again. It neither replaces catalog recovery nor receives a production signing key.

A separate default-off Cloudflare Pages Direct Upload job downloads the exact same-run immutable website artifact and verifies the upstream inventory digest, root-path provenance and current build/policy. It requires protected main, successful publish/website jobs, `SITE_DEPLOYMENT_ENABLED=true` and the `cloudflare-pages` environment. It has source/actions read only, no GitHub Pages write or backup credentials; Cloudflare secrets are confined to deployment. The exact project/subdomain/production branch is checked before upload. [Current host setup](../launch/CLOUDFLARE.md).

Before first public deployment, the owner must:

1. Use the current [deployment checklist](../launch/DEPLOYMENT.md), review the exact launch revision and passing checks, and obtain owner authorization. Observed protection requires PRs/strict `test` but zero human approving reviews and no enforced CODEOWNER review; this does not replace required human content inspection. Do not bypass or alter protection.
2. Configure the exact Free Cloudflare Direct Upload project `loghub` with `loghub.pages.dev`/main. No alternate URL, Git integration, domain purchase or paid feature. Keep GitHub Pages disabled.
3. Configure `cloudflare-pages` environment restrictions and scoped secrets as described in the checklist. Do not expose Cloudflare credentials to builds or PRs.
4. Only after a separate explicit owner go decision, enable the deployment variable and dispatch the existing workflow on protected main. No public upload was performed during preparation.

No remote merge, Pages enablement, repository security weakening or public deployment was performed for this milestone. End-to-end Pages hosting remains unverified until that authorization step. Browser CI runs on the review PR with read-only permissions, no backup/App secrets and no privileged workflow_run/pull_request_target bridge.

## Remaining work and limits

Owner visual approval and production deployment remain pending. There are no approved community projects to exercise real community artwork publicly. Safari/WebKit, Firefox, physical devices, screen readers, slow-network field performance and production Pages headers were not tested. A separately approved architecture is still required for persistent ratings, abuse controls, aggregation and privacy. A short source-check-to-upload interval remains a GitHub platform boundary; no atomic deployment transaction across policy changes is claimed.

Skill versions, compatibility, reviewed install behavior and scoped use are recorded in [SKILLS.md](SKILLS.md).

Hosted browser setup: the first Ubuntu run stopped before page tests because AppArmor denied the downloaded Chromium sandbox. CI now selects the runner's preinstalled Chrome through Playwright's supported channel setting; chromiumSandbox remains true. This follows Chromium's documented installed-Chrome profile and does not change kernel policy or disable sandboxing. Windows continues using the project-local pinned Chromium download.

The next hosted run passed 19 functional/accessibility cases with sandboxed Chrome 157 but exposed a screenshot-only wait on offscreen lazy gallery images. The capture helper now explicitly requests every image before awaiting successful decoding. Production keeps lazy loading; broken images fail the test instead of being silently ignored. No test was skipped or weakened.

## Hosted GitHub verification

PR #24 passed both hosted checks on candidate 68ac1c0: [73 Node tests](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43673022005) and [20 browser tests](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/actions/runs/43673022067). The browser run used the preinstalled Linux Chrome 157 channel with chromiumSandbox enabled, including the complete screenshot stage. Earlier sandbox-startup and lazy-image-capture failures are retained as failed attempts, not counted as successful verification. Pages deployment remains off and the PR remains unmerged.
