---
version: 1
slug: "components-integrations-mathquest-settings-tsx"
primary_target: "components/integrations/mathquest-settings.tsx"
related_targets: ["components/integrations/exam-publication.tsx"]
---

# MathQuest integration extension

Mode: Operate. Extend settings and the result action bar; preserve the established ScanSob world, scanner, score table, exports and navigation. No new visual identity, quota dashboard or shipping raster.

## Direction contract

THESIS: A teacher distinguishes confirming a score from allowing students to see it. Connection approval, publication and delivery are separate states.

OWN-WORLD: Inherit DESIGN.md's navy navigation, cobalt actions, teal completion, dark ink, Noto Sans Thai, semantic badges and existing Radix confirmation dialogs. Ordinary classroom daylight and phone use require a light, readable surface.

STORY: See the destination school, request permission with one button, and wait for the attendance administrator to approve or reject the request. Teacher-facing copy names the system ระบบเช็คชื่อ and shows the school separately. Approval grants manual publication by default. Future automatic publishing still needs separate consent. Review sent, pending and unmatched results and withdraw before deleting.

FIRST VIEWPORT: Settings adds one compact section after account identity and before school defaults. Results retains its table and export action; an optional secondary MathQuest button opens a bounded dialog, with destination, confirmed count, truthful status and primary action. Unmatched IDs use a scrollable disclosure. Existing screens do not gain an extra tall panel.

FORM: Precisely scoped local extension, code-led. Inherited world seed e0df4ce4; no new seed or decision comp applies. Signature interaction is consent-gated publication: pending remains amber until server acknowledgment. Motion inherits existing short feedback and reduced-motion rules.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries

Demo never makes real integration requests. Disabled or receiver-not-ready states offer no fake successful pairing. Owner inspection is read-only and does not show private integration outcomes. Confirmed score/QR/geometry never change. Test connected fixtures on desktop, phone and iPad, keyboard dialogs, busy/error/partial/unmatched states, stale workspace requests and no page overflow. Production receiver/auth/staging E2E remains gated.
