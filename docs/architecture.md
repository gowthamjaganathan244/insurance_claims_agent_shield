# Architecture and maintenance

## Rendering and loading

App Router route segments split each view. Command, claims, security, reliability and communications shells are prerendered; claim details validate route IDs on the server. A shared root provider owns claim state across navigation. Interaction boundaries are small client components; static incident content, page headings, SVG storyline markup, pipeline and service records render on the server.

Do not replace the source with an iframe, injected HTML, or an imperative DOM router. React owns view state. All message edits render as escaped text, including literal HTML. Routes validate IDs and provide a not-found view and error boundary.

## State

`ClaimProvider` holds typed claims and appended session audit events. Analysis cards share one action function. Journey, filter membership and payment text derive from the current claim, avoiding stale duplicated state. High-risk recommendations escalate; low-risk recommendations approve, matching the source rules. The source's fixed operational counts are preserved and are not live aggregations.

Communications owns per-template drafts; variable extraction and preview use those same drafts. Historical versions and delivery statistics are reference fixtures, not records of local edits. Never present them as real delivery telemetry.

## Navigation and accessibility

The Dynamic Island preserves the reference's desktop expanded state, mobile compact state and directional scroll collapse. A single passive scroll listener uses requestAnimationFrame. Hidden navigation is inert; Escape returns focus to the toggle. Outside pointer interactions close the island. Native links support deep links and browser history. Original `#/...` bookmarks migrate to path-based routes.

Tabs implement roving focus, arrows, Home/End, connected ARIA controls and selected state. Documents expose expanded state. Incidents use native details/summary. Status changes announce through a polite live region. A keyboard range control exposes chart samples. The skip link targets each route's main landmark.

## Motion and performance

System fonts avoid font downloads and layout shifts. Charts use deterministic SVG, avoiding large dependencies. Static values are rendered immediately. Short transform/opacity animations animate view entrances; pipeline tracks, glow and navigation preserve the original visual character. Pointer illumination is frame-limited on capable desktops only. Mobile disables glass backdrop processing on content cards and background movement. Reduced-motion, low logical CPU count, low reported device memory and data-saving preferences disable costly motion; unsupported hints simply use the CSS/mobile fallback.

Motion settings update on reduced-motion changes. Listeners, frames and toast timers are cleaned up. Native route splitting keeps page-specific code isolated. Core Web Vitals in the field still depend on deployment, network and hardware; local audit results are not a field guarantee.

## Styles

The stylesheet retains the source's cascade (base glass styling, final charcoal palette, final Dynamic Island refinements), followed by React-specific fixes. This deliberate order preserves the approved source. Edit final tokens or the clearly marked implementation section to avoid being overridden by an earlier theme layer. Layout containment uses minmax(0, 1fr), wrapping and mobile stacking, rather than relying only on clipping oversized content.

## Deployment boundary

No secrets, credentials, vendor runtime or environment file belongs in Git. Production security headers deny framing and disable unused camera/microphone/geolocation capabilities. Add authentication, request validation, server authorization, durable audit events, rate limiting and retention requirements in the backend integration phase. A nonce-based CSP should be designed with the selected host's SSR strategy rather than disabling Next.js inline hydration scripts.
