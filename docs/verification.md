# Verification record

Tested on 9 October 2026 (Australia/Sydney).

## Required checks

- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed with strict TypeScript.
- `npm run build`: passed with Next.js 16.4.0 / React 19.3.0.
- `npm audit --omit=dev`: zero known runtime vulnerabilities at verification time.
- `git diff --check`: passed.

## Browser verification

32 Playwright tests cover Chromium, Firefox, WebKit and mobile WebKit. All six views are checked at 320, 390, 768, 1024, 1440 and 1920px. Tests cover console/hydration errors, horizontal overflow, claims filtering and actions, payment/audit consistency, document evidence, native incidents, message drafts, template variables, keyboard tabs, keyboard chart inspection, Dynamic Island navigation, Escape, scroll collapse, invalid claims, legacy hash URLs, reduced motion and low-power backdrop reduction.

Automated axe WCAG A/AA checks report no violations on the six tested views in those browser projects. Automated checks do not replace a complete manual accessibility audit.

The installed Google Chrome 155.0.8059.39 also passed a six-route smoke test. Safari compatibility was exercised using Playwright WebKit and its iPhone emulation, not a real iPhone. Edge uses the tested Chromium engine; the branded Edge executable was not installed, so it was not tested separately. Hardware devices and older browser versions were not tested.

## Mobile Lighthouse lab audit

| Measure | Result |
| --- | --- |
| Performance | 99 / 100 |
| Accessibility | 100 / 100 |
| Best practices | 100 / 100 |
| First contentful paint | 0.8 seconds |
| Largest contentful paint | 2.0 seconds |
| Total blocking time | 30 ms |
| Cumulative layout shift | 0 |

Measured against the local optimized production server using Lighthouse's mobile configuration. Results vary with host, network and hardware. This is not a claim of field Core Web Vitals or measured real-user INP. The final CSS refinement only disables additional blur on constrained devices. See `lighthouse-summary.json` for the recorded lab result.

## Fidelity and repairs

Compared desktop and mobile production screenshots with the supplied source. Preserved the reference content, palette, layout, pipeline, navigation and interaction model. Corrected mobile timeline geometry, stale filtered selections, draft loss across template tabs, keyboard focus, reduced-effect CSS prefix ordering and true HTTP 404 responses. Disabled eager Next.js link prefetching after it generated unnecessary background requests and WebKit cancellation logs during rapid navigation.

## Scope

The application remains a demonstration with reference fixtures and session state. No live claims API, malware engine, payment execution, authentication or customer messaging backend was present in the HTML. GitHub Actions repeats the lint, typecheck, production build and browser suite on pushes and pull requests.
