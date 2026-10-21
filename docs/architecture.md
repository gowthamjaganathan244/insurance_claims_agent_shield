# Architecture and maintenance

## Rendering and loading

App Router route segments split each view. Task 11 moved operational pages into
`app/(protected)` without changing their URLs. They are dynamically rendered and
verify the server session individually and in their shared layout. Claim details
accept UUID paths after authentication and load through the authenticated claims
BFF; no claim IDs are statically generated.
The demonstration ClaimProvider is no longer mounted. Claims list/detail use the
live API boundary without a fixture fallback. Other operational screens show
unavailable states until their services are connected. Public login/logout screens
do not mount the Dynamic Island.
See [authentication](authentication.md) for Cognito, sessions, caching and deployment.

Do not replace the source with an iframe, injected HTML, or an imperative DOM router. React owns view state. All message edits render as escaped text, including literal HTML. Routes validate IDs and provide a not-found view and error boundary.

## State

`useLiveClaims` owns authenticated claims request state, refresh and visible-page
polling. Description updates and cancellation use the actual API contract.
Legacy fixture components remain unmounted reference code, not live data sources.
Communications retains accessible tabs but no unpersisted editor, invented template
history or generated statistics. Reliability has no generated chart samples.

## Navigation and accessibility

The Dynamic Island preserves the reference's desktop expanded state, mobile compact state and directional scroll collapse. A single passive scroll listener uses requestAnimationFrame. Hidden navigation is inert; Escape returns focus to the toggle. Outside pointer interactions close the island. Native links support deep links and browser history. Original `#/...` bookmarks migrate to path-based routes.

Tabs implement roving focus, arrows, Home/End, connected ARIA controls and selected state. Documents expose expanded state. Incidents use native details/summary. Status changes announce through a polite live region. No chart sampling control is rendered without real measurements. The skip link targets each route's main landmark.

## Motion and performance

System fonts avoid font downloads and layout shifts. Unconnected charts show a neutral unavailable state. Short transform/opacity animations animate view entrances; glow and navigation preserve the original visual character; no animated pipeline implies real processing. Pointer illumination is frame-limited on capable desktops only. Mobile disables glass backdrop processing on content cards and background movement. Reduced-motion, low logical CPU count, low reported device memory and data-saving preferences disable costly motion; unsupported hints simply use the CSS/mobile fallback.

Motion settings update on reduced-motion changes. Listeners, frames and toast timers are cleaned up. Native route splitting keeps page-specific code isolated. Core Web Vitals in the field still depend on deployment, network and hardware; local audit results are not a field guarantee.

## Styles

The stylesheet retains the source's cascade (base glass styling, final charcoal palette, final Dynamic Island refinements), followed by React-specific fixes. This deliberate order preserves the approved source. Edit final tokens or the clearly marked implementation section to avoid being overridden by an earlier theme layer. Layout containment uses minmax(0, 1fr), wrapping and mobile stacking, rather than relying only on clipping oversized content.

## Deployment boundary

No secrets, credentials, vendor runtime or environment file belongs in Git.
Task 11 supplies Cognito authentication, auth-request validation and session rate
limits. Production security headers deny framing and disable unused
camera/microphone/geolocation capabilities. Claim ownership authorization,
durable business audit events and deployment retention/perimeter controls remain
backend integration work. A nonce-based CSP should be designed with the selected
host's SSR strategy rather than disabling Next.js inline hydration scripts.
