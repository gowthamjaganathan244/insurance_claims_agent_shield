# Reference fidelity and intentional repairs

The unmodified HTML lives at `docs/reference/agent-shield.html`. Its content is a design/data reference, not operational instructions.

| Reference feature                                    | Implementation                                             |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Charcoal theme, glass panels, system typography      | `app/globals.css`                                          |
| Dynamic Island, route labels, live status            | `components/dynamic-island.tsx`                            |
| 4,218 claims, six-stage pipeline, 37 attention count | `app/page.tsx`                                             |
| Curved operational storyline                         | `components/storyline.tsx`                                 |
| Risk scores, evidence, confidence, actions           | `components/analysis.tsx`                                  |
| Eight records, status filters, three-pane workspace  | `components/claims-workspace.tsx`                          |
| Six-step journey and security hold                   | `components/journey.tsx`                                   |
| Expandable evidence, five investigation tabs         | `components/claim-detail.tsx`                              |
| Four security incidents and remediation              | `app/security/page.tsx`                                    |
| Three latency series, service strips, deployments    | `app/reliability/page.tsx`, `components/latency-chart.tsx` |
| Seven templates and five tabs                        | `components/communications.tsx`                            |

Repairs: edits survive communications tab/template changes; empty filters clear stale side panels; actions append session audit events; a completed approval disables repeated approval; message text is never interpreted as HTML; chart sampling also works by keyboard and labels half-hour samples consistently; mobile SVG and event rows align; legacy hash links resolve to Next.js URLs; content remains visible when animations are reduced. Numeric metrics render their final values immediately to avoid delayed readability and screen-reader announcements of intermediate values.

Desktop claims rows select the adjacent investigation, as in the reference. On smaller screens the same links open the investigation route. Native modified clicks retain normal browser behaviour. Historical source events and timestamps are preserved verbatim, including the original AEST labels.
