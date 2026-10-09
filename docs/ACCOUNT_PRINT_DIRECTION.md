# Account access and roster printing extension

Approved scope: Google sign-in, pending/approved/suspended access, owner approval and read-only inspection of other workspaces, private original-byte Supabase logos with old-image cleanup, roster-derived classroom choices, persistent settings, and personalized OMR printing. Owner: piyawatpiwsiri@gmail.com. Production origin: https://scansob.netlify.app.

## Direction contract

THESIS: A teacher knows whose workspace is open and whose paper is being printed. Approval never implies another teacher's data is shared.

OWN-WORLD: Inherit DESIGN.md's Noto Sans Thai, ink-blue navigation, white document surfaces, compact native form controls and semantic status notices. Teachers prepare class papers on desktops in ordinary classroom daylight; use the existing light workspace.

STORY: Sign in with Google, see a truthful access status, and after approval work privately. The owner deliberately opens another user's read-only workspace. Printing selects an actual roster, previews one named sheet, and imposes different students left/right on A4.

FIRST VIEWPORT: Login keeps the existing split story/action area. Pending access shows the account and next action without workspace navigation. Settings places account status before editable school/subject defaults and owner controls. Print retains the paper-left/settings-right composition, with roster selection above print readiness.

FORM: Precisely scoped extension of the incumbent Operate surfaces; no new visual-world or composition tournament. Inherited world seed 19bece82; no new seed required for this local extension. Code-led, no new raster assets.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification and boundaries

Test PostgreSQL approval, owner bootstrap and workspace/storage isolation; forged workspace/role requests; suspended sessions; logout/account switching; original logo bytes and failed/concurrent replacement cleanup; real classroom choices; five-digit leading zeros; personalized PDF and preview agreement; desktop/mobile and keyboard states. Existing scanner/crop work stays intact. Do not claim optical grading or production readiness without real end-to-end scan validation.
