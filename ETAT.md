# לא ינום — ETAT

> הִנֵּה לֹא יָנוּם וְלֹא יִישָׁן שׁוֹמֵר יִשְׂרָאֵל
> — תהלים קכ"א, ד

**Lo Yanum** ("He does not slumber") — coordination tool for a volunteer
farm-protection programme in the northern and central Negev.

This file is the project's memory. A completely fresh session must be able to
read it and resume with no questions asked. **Every session starts with "Read
ETAT.md and continue."**

---

## 1. Resume

```bash
bun install && bun run dev
```

Open http://localhost:5173 and pick an identity on the landing screen.

**That is DEMO MODE, and it is the default on purpose.** `bun run dev` shows the
POC's identity picker on the mock store, with no login, because that is what
every browser verification gate drives. **`bun run dev:real` is the real app**:
it reads `.env.real` (see `.env.example`), requires a Supabase session, and hides
the role switcher. The file is called `.env.real` and NOT `.env` for one
load-bearing reason — Vite auto-loads `.env` in every mode, so a `.env` here
would silently turn `accept`, `outreach`, `rtl`, `mapfirst`, `splitter`, `touch`,
`wizard`, `import` and `layout` into runs against a login form.

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on :5173, **DEMO MODE** (honours `PORT` so a second one can run alongside) |
| `bun run dev:real` | The same server in **REAL MODE** — reads `.env.real`, requires a Supabase login |
| `bun run preview` | Serve `dist/`. **The only way to see the service worker**, which never registers in dev |
| `bun run build` | Typecheck + production build to `dist/` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run contrast` | WCAG audit of the design tokens (A13/A19) — 133 pairs, fails the build on a regression |
| `bun run tokens` | **A28/A29** — one radius scale, no tinted field, orange only where it is allowed. No browser needed |
| `bun run dispatch` | Guard-scoring verification (A21) — 27 checks, no browser needed |
| `bun run accept` | Acceptance criteria driven through `@core` (A4–A23) — 150 checks |
| `bun run sync` | **A77** — the offline data layer's rules (P2.5b): the cache restores what was on screen, six edits to one guard coalesce to ONE outbox entry, the oldest flushes first, a FAILED flush keeps everything, a deletion survives as a deletion, and signing out clears both stores while losing the network clears neither. 28 checks — no browser, no dev server, no network |
| `bun run write` | **A76** — ⚠️ **THE WRITE PATH, END TO END, AGAINST THE REAL DATABASE** (P2.6b). Signs in as a DISPOSABLE test account, writes 17 aggregates across all 25 tables through `applyChanges` — the app's own function, not a copy — reads them back through `hydrateFrom`, compares, writes again to prove an update is not a duplicate, then deletes everything and proves the database is exactly as it was found. Every id begins `a76-`. Section 6 replays a P2.5b outbox into the real database. 38 checks — needed `.env.test`. ⚠️⚠️ **THE ACCOUNT WAS DELETED IN P3.1 (§13), SO THIS GATE NOW FAILS AT ITS FIRST CHECK AND THAT IS THE GREEN RESULT.** It is kept because it documents the write path and because a future session with its own disposable account can run it again |
| `bun run live` | **A75** — the LIVE schema against the mapper (P2.6b), and **it needs no password**. PostgREST resolves `?select=` against the schema BEFORE applying RLS, so an anonymous request names a missing column (400/42703) and an existing one answers `[]`. 24 tables probed column by column, 15 enums probed label by label, `app_users` closed to a stranger. 46 checks — needs the internet, not a dev server |
| `bun run mapping` | **A74** — the mapper (P2.6b). Drives all 380 fixture aggregates out through `toRows` and back through `fromRows` and fails on any difference, then parses this repository's OWN migrations and asserts both directions of the column contract: no column the mapper writes is missing, no `not null`-without-default column goes unwritten. 32 checks — no browser, no dev server, no network |
| `bun run persist` | **A73** — the store interface (P2.6a). Drives all 45 exported mutations through a RECORDING backend and asserts what each one writes: the fan-outs (a zone rewrites the farm's dunams, the dual hat materialises a driver, a visit rewrites `nextVisitAt`), the ones that mutate IN PLACE and an identity diff would silently lose, and the three things that must never be written (a session change, a reset, a hydration). 84 checks — no browser, no dev server, no network |
| `bun run auth` | **A70** — the door (P2.3). Starts its OWN two dev servers, one in each mode, and compares them: real mode shows the login form and nothing else on 8 routes, refuses a wrong password IN HEBREW, gives an unknown address the SAME message, leaves no token behind; demo mode is byte-for-byte P0bis. Then B1 without a browser — 26 tables anonymously closed, an anonymous coordinator-grant INSERT refused, the three policy helpers 404. 20 checks — **needs no dev server, and never needs the password** |
| `bun run offline` | **A72 + A78** — the offline shell (P2.5a) AND the signed-in offline session (P2.5b). The ONLY gate that BUILDS the app and serves the build, because the service worker is production-only: the worker takes control, one online load is enough to survive being pulled offline, ★ **a Supabase read offline FAILS** (nothing from the API is ever cached), looked-at ground is still there, the badge comes and goes, the frozen /poc comes back as ITSELF, and a real build shows its door rather than a browser error. **P2.5b added the only claim in this project that cannot be made outside a real browser**: signed in, IndexedDB really holds the snapshot, a token that cannot be refreshed offline does NOT end the session, the network coming back re-asks and a refusal DOES end it, and an explicit sign-out empties the device. **PO return 3 (2026-08-31) added the other half of the same scenario**: the reopened offline app SHOWS ITS OFFLINE BADGE, and the door explains the one thing that genuinely needs a network — `אין חיבור לאינטרנט — נדרש חיבור להתחברות ראשונה` — before a password is typed, and again instead of a generic server error if one is. **And PMTiles folded in the claim the whole map unit exists for**: the basemap answers a RANGE request with no network at all (the Cache API refuses a 206, so the worker holds ONE archive and slices it), what comes back is the archive rather than an error page, and the map really draws from it. **19 checks and ONE SKIP is the green result since P3.1 (§13)** — the last section needs `.env.test` and the disposable account is gone, which is the intended end state. It was 33 before. **No dev server; it makes its own** |
| `bun run storage` | **A71** — the two private buckets (P2.4): no public route on either (`NoSuchBucket`, the one proof that does not depend on them being empty), no bucket or object enumeration, no signed URL minted for a stranger, no anonymous upload. 10 checks — no browser, no dev server, no password |
| `bun run outreach` | **A68 + A69** — the sending centre and the WhatsApp group kit, read off the rendered DOM: the right channel per phone type, prefilled `wa.me` / `sms:` / `mailto:` links DECODED and checked, the grouped SMS and email, the sent tick surviving navigation, and the kit's three copies. 25 checks — needs a dev server |
| `bun run rtl` | **A67** — the generated .xlsx downloaded through the real UI, then opened: both sheets `rightToLeft`, every cell styled, every style right-aligned with `readingOrder="2"`, the header frozen, the instructions sheet complete. 45 checks — needs a dev server |
| `bun run mapfirst` | **A64** — the exhaustive "map on the LEFT" audit: every route in the app at iPad landscape, each screen printed with whether it carries a map and, if it does, proof the map is the left column. Exemptions print their reason. Needs a dev server |
| `bun run splitter` | **A65** — the map/content seam driven by MOUSE and by SYNTHETIC TOUCH at iPad landscape: 44 px grip and hit area, live canvas resize, ratio persisted per screen, bounds, double-tap reset. 72 checks — needs a dev server |
| `bun run layout` | **A24 + A30 + G11 + PO returns 5 and 7** — overflow, pinned overlap and uncontained-list sweep over all 24 screens, now **at three positions of the map/content seam** (the screen's own default, 25 %, 75 %) reached by focusing the real `role="separator"` and pressing `End`/`Home` — one page load, three ratios. Horizontal scroll is measured TWICE: `scrollWidth`, and the document's real scroll range, because this app is RTL and its overflow goes LEFT into negative `scrollLeft`. `VIEWPORT=phone` (default, 390) / `iphone` (402×874) / `ipad` (1032×1376) / `ipad-ls` (1376×1032) / `all`. **`STANDALONE=1` runs the whole sweep as the INSTALLED APP** — stamps `data-standalone` and the real devices' safe-area insets, asserts the status-bar gradient's height and that no control inside a viewport-pinned bar rests in the system zone, and captures `docs/screenshots/standalone/`. Needs a dev server |
| `bun run wizard` | **A27** — the guard wizard played from a farm with NO anchor point, 28 checks — needs a dev server |
| `bun run touch` | **A63** — every map gesture driven by SYNTHETIC TOUCH at iPad portrait 1032×1376, 32 checks — needs a dev server |
| `bun run import` | **A44** — download each template, fill it, upload it back, find the records; 28 checks — needs a dev server |
| `bun run screenshots` | Regenerate `docs/screenshots/` — needs a dev server |
| `bun run brand-reference` | Re-capture `docs/brand/` from the live artzenu.org.il — needs the internet, NOT a dev server |

> The ten browser scripts (`outreach`, `rtl`, `mapfirst`, `splitter`, `layout`,
> `wizard`, `touch`, `import`, `screenshots`, `brand-reference`) take
> `BASE_URL`, e.g.
> `BASE_URL=http://localhost:62807 bun run layout`. **`auth` is the exception**:
> it starts and stops its own two servers, on `REAL_PORT` (5199) and
> `DEMO_PORT` (5198), because its entire claim is a COMPARISON between the two
> modes and half-remembering which server was which is how that claim goes
> wrong.

> **Toolchain:** this machine has **no Node.js**. Bun is at `/usr/local/bin/bun`
> (Homebrew, Intel prefix `/usr/local`). `npm`/`node` fail with "command not
> found".

**Live preview (the app, and it keeps moving):**
https://azmer-fts.github.io/lo-yanum/
**REDEPLOYED 2026-08-31 WITH THE PO'S SEVEN RETURNS, and verified live rather
than assumed** — on the deployed page itself: the reveal button measures
**44 × 44**, the password field really flips `password` → `text`, its
`aria-label` is `הסתר סיסמה`, `autocomplete` is `username` /
`current-password`, and pulling the browser offline puts
`אין חיבור לאינטרנט — נדרש חיבור להתחברות ראשונה` on the door. In the shipped
files: the stylesheet carries `--shell-bottom: var(--safe-bottom)` (point 6's
grey band is gone from the artefact, not just from the tree) and the
`html[data-standalone] body:before` gradient; the bundle carries the project
ref, `lo-yanum:last-email` and the Hebrew offline string; **`black-translucent`
appears only inside the explanatory comment and as no meta tag**, which is the
whole of the judgement call in §12bis.7. The frozen `/poc` bundle still
contains the project ref **zero** times.
**AND THE KEEP-ALIVE RAN FOR REAL** (`workflow_dispatch`, run 33390602694):
`attempt 1: HTTP 200`, `Response: []`, and the two secrets masked as `***` in
the public log while the project ref still prints — which is what the `sed` on
the host was for.

**(previous) DEPLOYED 2026-08-31 WITH P2.6 + P2.5b, and verified live rather than
assumed:** the app's bundle CONTAINS the project ref (so the build is REAL and
not the silent demo fallback the note below warns about) and the deployed page
renders the Hebrew login form; the frozen `/poc` bundle contains the project
ref **zero times**, which is what "frozen" has to mean.
**The FROZEN POC (G13, never redeployed):**
https://azmer-fts.github.io/lo-yanum/poc/
Public repo: https://github.com/Azmer-FTS/lo-yanum — deploys on every push to
`main` via `.github/workflows/deploy.yml`.
**And `.github/workflows/keepalive.yml` (PO return 4) pings the Supabase REST
API every two days** so the free project is never paused for inactivity. ⚠️ It
becomes pointless and should be DELETED the day the project moves to a paid
plan; and GitHub disables scheduled workflows in a public repository after 60
days with no commits, so a two-month pause in the work pauses the database a
week later. See §12bis.4.

State: **FINAL ORDER OF MARCH IN PROGRESS (2026-08-30). PHASE P0 IS DONE.
PHASE P1: G10, G18 and G12's verification ARE DONE. PHASE P2: P2.2 (schema +
RLS) IS APPLIED. PHASE P0bis IS IN PROGRESS — P0bis.1 (map on the
left EVERYWHERE), P0bis.2 (the draggable seam), P0bis.3 (the density pass)
and P0bis.4 (a really-RTL .xlsx) ARE DONE and green (A64: 26 screens; A65: 72
checks; A66: the screen-by-screen table below; A67: 45 checks). Next:
P0bis.5 IS DONE (a, b and c). **PHASE P0bis IS COMPLETE, AND G13 HAS FROZEN
THE POC.** **P2.3 (AUTH) IS DONE** — the deployed app requires a Supabase
session, A70 is green at 20 checks, and the initial bundle grew by 1.6 kB
gzipped rather than 103. **P2.4 (STORAGE) IS DONE** — two private buckets, one
read rule that asks the existing RLS rather than restating it, A71 green at 10
checks. **P2.5a (THE OFFLINE SHELL) IS DONE** — service worker, offline badge,
הגדרות, A72 green at 11 checks. **P2.5 IS SPLIT** (PO decision, 2026-08-31): its
DATA half cannot precede P2.6, because an outbox flushing to a mock store and an
IndexedDB cache persisting demo data would contradict "the real app starts
EMPTY". **P2.6 (THE REAL SWITCH) IS DONE** — the store is an interface with a
demo and a Supabase implementation, the real app starts EMPTY, the write-through
is derived from a structural diff rather than declared, and the schema caught up
with `types.ts` (two units of drift, found by A74 on its first run). A73 green
at 84, A74 at 33, A75 at 46 — and every pre-existing gate re-run green. **P2.5b (THE OFFLINE DATA LAYER) IS DONE** — an IndexedDB read
cache, a coalescing write outbox, the "N ממתינים לסנכרון" badge, a documented
conflict rule, and a session that no longer ends because a token could not be
refreshed on a farm track. A77 green at 28, A78 folded into A72 at 24, A76 at
38. **Criterion B2 is complete.** **THE PRODUCT OWNER'S SEVEN RETURNS OF
2026-08-31 ARE DONE** (§12bis): the password eye, the remembered address, the
offline door — which JOINS criterion B2 — the Supabase keep-alive workflow, the
horizontal-scroll rule now permanent in `bun run layout` at three splitter
ratios, the grey band at the foot of the real app (its cause was a token, not a
component), and P3.4's installed-app status bar with `STANDALONE=1 bun run
layout` behind it. **PMTILES (decision 71) IS DONE** (§12ter): a 42 MB
self-hosted Protomaps archive in the project's first PUBLIC bucket, a vector
style written from `tokens.css` in both themes, the `hue-rotate` deleted — which
closes open question 9 — the glyphs, sprites and the RTL plugin vendored so the
map needs NO external host, and a real "download the map" button whose service
worker synthesises 206s out of one cached archive. `offline` green at **33**,
`mapfirst` 27, `splitter` 72, `touch` 32 — **and it is DEPLOYED and verified
live**. **P3.1's test-account deletion IS DONE (§13).** Next: the product
owner's SECOND RETURN of 2026-08-31 — eleven points in his order, listed in the
RESUME block at the foot of this file, then the rest of P3. One
commit per unit. Branch `main`.

> ✅✅ **THE STANDING REMINDER IS DISCHARGED (2026-08-31). THE TEST ACCOUNT IS
> GONE — auth user, `app_users` row and `.env.test`, all three verified by a
> RE-READ rather than assumed. See §13.** `dov+test@serialkolors.com`
> (`304d2f3b-90ca-43dc-bfac-1361c8184303`) existed so that `bun run write` could
> prove the write path against Frankfurt, and it carried a `coordinator` grant —
> total read and write over the whole programme, which was a grant over NOTHING
> while the database was empty and would have been a second door onto real
> farmers' phone numbers the moment P3.1 imported them. It no longer exists.
> ⚠️ **THE CONSEQUENCE, AND IT IS NOT A REGRESSION:** `bun run write` now FAILS
> at its first check and `bun run offline` now reports **19/19 with its last
> section SKIPPED**. Those are the green results. Do not "repair" either one,
> and do not re-create the account.

> **P0bis.1 — THE MAP IS ON THE LEFT ON EVERY SCREEN THAT HAS ONE (frozen PO
> rule).** Five screens obeyed the map-first gabarit and eight others put the
> map ON TOP of the content, which is the same information in two places
> depending on the route you arrived by. What was done:
> · **`ui/components/MapSplit.tsx` IS NOW THE ONE SHELL.** `MapPanel` and the
>   farm detail each carried a hand-written copy of the layout and the copies
>   had already drifted (one breaks at `lg`, the other at `xl`). Both now
>   delegate. It takes a `breakpoint` (`lg`/`xl`), a `contentPercent`, and a
>   render prop for each half that receives `{ mode, setMode }` — the farm
>   detail needs the setter, because selecting a zone there has to bring a
>   hidden map back.
> · **TWO SCROLL STRATEGIES, AND THE SECOND ONE IS WHY THE ROSTERS COULD JOIN
>   AT ALL.** `scroll="panel"` is Lot 0.9's reading: the content column is its
>   own scroll container. `scroll="page"` keeps the WINDOW as the scroll
>   container and makes the MAP column `sticky` instead. P0.2's note "WHY NOT
>   MapPanel" was right — a G7 window-virtualised table inside an
>   `overflow-y-auto` column measures its scrollMargin against the wrong box
>   and draws its rows a page above themselves — so the shell grew a second
>   strategy rather than the screen a second layout. `PeopleMap` is now just
>   the map; the bubbles are the left panel and the 300-row table is the right
>   one, with G7 untouched.
> · Converted, each named in the A64 run: **volunteers, drivers, mission
>   detail, incident detail, anchor sheet, anchor form (both routes), farm form
>   (new + edit)**. Already compliant: dashboard, farms, route planner,
>   missions, incidents, farm detail, wizard step 1.
> · **`contentInFull: 'unmount'`** exists for the two rosters only, and for the
>   same virtualiser reason: everything else is `display:none` in `full`, which
>   is what preserves a list's scroll position and its progressive page.
> · **The bleed list became "every screen that carries a map".** A map-first
>   screen pads itself inside MapSplit's content column, so `isBleedPath` grew
>   the two rosters, the two detail routes, the anchor routes and the farm
>   form. The incident detail is the one screen that can go BOTH ways — an
>   incident with no position has no map — so its mapless branch supplies the
>   padding the shell no longer does.
> · **The FIELD screens (farmer/volunteer/driver) are the printed exception.**
>   Their shell is a `max-w-2xl` phone column at every width, which IS the
>   narrow responsive form the rule allows; splitting 672 px in two would be
>   worse on the phone those screens exist for. A64 prints the reason on every
>   run rather than skipping them silently. **This is the one judgement call in
>   P0bis.1 and it is the PO's to overturn.**
> · `PinMap` gained `flush` (square corners, error as an overlay) so the farm
>   form's pin can fill a panel, the same trick `AnchorMap` already had.
>
> **P0bis.2 — THE SEAM BETWEEN THE TWO PANELS IS A CONTROL.**
> · `ui/components/splitter.tsx` — `PanelSplitter`, a `role="separator"` with
>   pointer events (mouse AND finger through one code path), `touch-action:
>   none` (load-bearing: without it the first millimetre of a drag is claimed
>   by the page's own scroll and the handle never sees the rest), pointer
>   capture, arrow/Home/End keys, and a double-tap reset.
> · **A COMPONENT, NOT A `MapSplit` DETAIL, ON PURPOSE.** The wizard's step 1
>   is map-first but lives inside the stepper's own height budget; had the
>   splitter been private to MapSplit, that screen would have been the one
>   exception to a rule that was just frozen.
> · **THE RATIO IS THE CONTENT'S SHARE, 25–75, PERSISTED PER SCREEN** under
>   `lo-yanum:map-ratio:<screenKey>` — the mode's own key space. Storing the
>   CONTENT's share is what makes the drag one formula in both writing
>   directions: the content column is always the physical right one
>   (decision 34), so its width is "the shell's right edge minus the pointer",
>   with no per-direction sign. The bounds are not decoration — past either end
>   one panel stops being a panel and starts being a stripe.
> · Published as `--content-w` on the shell and consumed as
>   `lg:w-[var(--content-w)]`, because a `lg:w-1/3` cannot be dragged.
> · The map canvas follows inside the same gesture — MapCanvas's ResizeObserver
>   was already there — and A65 asserts it: the canvas grows by exactly what
>   the content lost, on all five screens.
> · **A65 caught a real trap in its own first draft**, worth keeping: asserting
>   "the content shrank by the pixels dragged" fails on any row with a `gap`
>   between the panels (the wizard has one). The ratio is computed from the
>   pointer's ABSOLUTE position, so the expected value is exact and the
>   assertion is now written against the model rather than against a delta.

> **P0bis.3 — THE DENSITY PASS, SCREEN BY SCREEN (A66).** Three rules from the
> product owner: (a) the context's key information at the top, BIG — "he
> drives"; (b) blocks with little in them go TWO PER ROW instead of stretching
> down the page, and re-stack when narrow; (c) no unjustified emptiness.
>
> **THE MEASUREMENT MOVED FROM THE VIEWPORT TO THE BOX, AND IT HAD TO.**
> P0bis.2 made the content column a width the coordinator drags, so a
> `xl:grid-cols-4` stopped being merely coarse and became WRONG: the viewport
> is `xl` while the panel it lays out in may be a quarter of the screen. Three
> utilities in `index.css` replace the breakpoints inside panels:
> · `.auto-cols` + `[--col-min:…]` — `repeat(auto-fit, minmax(min, 1fr))`. Asks
>   no question and needs no container: it lays out against the width it has.
>   KPI strips, dunam cards, status counts.
> · `.metric-band` — the same thing at a 9 rem floor, for a key-numbers band.
> · `.pair-grid` (36 rem) / `.pair-grid-wide` (50 rem) inside a `.panel-scope`
>   — CONTAINER queries. Used where two columns need a real judgement about
>   room.
> · `.form-grid` — a `FormSection` is its own measuring box now, so a form is
>   two columns when THE SECTION is wide enough. `md:col-span-2` became
>   `col-span-full` at all 17 call sites (inert in the one-column reading).
> · **`container-type: inline-size` also makes an element a containing block
>   for `fixed` descendants**, so `.panel-scope` is always a small deliberate
>   wrapper — never `main`, and never an ancestor of a modal. `Modal`'s own
>   dialog carries it, which fixes a pre-existing mismatch: a `md:grid-cols-2`
>   inside a 32 rem dialog gave two 15 rem columns on any desktop.
>
> **Screen by screen — every screen in the app, including the ones that did not
> change and why:**
>
> | Screen | What the density pass did |
> |---|---|
> | dashboard | dunam pair + KPI strip → `auto-cols` (they were `grid-cols-2 xl:grid-cols-4` in a HALF-width panel); "tonight" and "farms by status" pair on a wide panel |
> | agenda | DAY view: the itinerary and the hour ladder side by side (`pair-grid-wide`) — stacked, the ladder started below the fold. Week and month grids UNTOUCHED: a calendar is read like text (decision 34) and it is full-width, so its breakpoints are honest |
> | farms list | KPI strip → `auto-cols`; farm cards pair as soon as the panel can hold two |
> | farm detail | KeyNumbers → `.metric-band` (was `sm:grid-cols-3 2xl:grid-cols-5` in a 42 % panel); identity and contacts → `auto-cols`; the SIX lower blocks — guard history, incidents, contacts, commitments, agreement, visits — pair, which is where the screen's five screenfuls came from |
> | farm form | every `FormSection` container-queried; the three dunam fields → `auto-cols`; the pin map is the left panel (P0bis.1), so the form no longer has a 46 dvh hole in its middle |
> | anchor sheet | the two messages side by side — they are the same briefing written twice and the job here is checking they agree; access + instructions pair |
> | anchor form | `FormSection` container-queried; the map is the left panel |
> | route planner | the four panels (pick farms / order / meetings / navigate) pair — four short lists that were four screenfuls |
> | volunteers | KPI strip → `auto-cols` (was `sm:grid-cols-3 xl:grid-cols-6`); the map is the left panel |
> | drivers | KPI strip → `auto-cols`; map left |
> | import wizard | **the three counts became the headline**: "412 will import / 6 skipped / 11 need a pin" was set at chip size and IS the decision the screen asks for; the mapping grids container-queried |
> | missions list | guard cards pair |
> | mission detail | **the PO's own model**: a key-numbers band (start, end, team, cars, posts) FIRST; the two confirmation tables (נסיעה לחווה / חזרה בבוקר) SIDE BY SIDE — the question is a comparison and stacked it costs a scroll; details + drivers pair; the three facts now in the band deleted from the details list |
> | incident detail | the report is the headline and set one size up; the four facts about it move BESIDE it instead of under it; thread full width |
> | incidents list | incident cards pair |
> | guard wizard | step 1 gets the draggable seam; step 3 (phone round) and step 4 (drivers) cards pair — the wizard is full-page and a one-column list of twelve short cards spends most of an iPad on nothing. Steps 2 and 5 ALREADY optimal: 2/3 + 1/3 at `lg`, full-page, so the viewport breakpoint is the honest one |
> | driver trip | a two-number band: departure time and head count. Both existed — one as a subtitle, one as the length of a list — which is not the same as readable at the wheel |
> | farmer guards | "coming" and "past" pair; on the phone the field column is narrow and it stays one stack |
> | farmer tonight | **already optimal** — the arrival time and the status chip are the first things in the guard card, which is the whole question a farmer opens the app with |
> | volunteer guard | **already optimal** — the two big confirmation buttons are deliberately the first thing on the screen (in the dark, at 21:00, it is the only thing the group-phone holder needs to reach). A numbers band above them would push the one control down |
> | volunteer roster | **already optimal** — one section, one list |
> | farmer/volunteer report | **already optimal** — a form, and `FormSection` now sizes itself to the column |
> | styleguide | **unchanged by design** — a catalogue is meant to be read end to end (its A30 exemption already says so) |
> | landing | **unchanged** — one plate, one verse, the identity chooser |

> **P0bis.4 — THE TEMPLATE IS REALLY RTL, AND G10's FLAG NEVER WAS.**
> · **THE DEFECT.** G10 wrote `sheet['!views'] = [{ RTL: true }]` and called
>   the template right-to-left. Unzipping the file it produced shows
>   `<sheetView workbookViewId="0"/>` — no `rightToLeft` — and a `styles.xml`
>   with ONE default `xf`: the community build of SheetJS writes neither the
>   view flag nor cell styles (styling is a Pro feature). The coordinator's
>   template opened left-to-right with left-aligned Hebrew. The product owner
>   was right, and no flag was going to fix it.
> · **`src/core/xlsx.ts` — the workbook is written directly.** An .xlsx is a
>   ZIP of XML and the template is a file whose every part we own. ~330 lines,
>   pure, no dependency: `rightToLeft="1"` on each sheet view, a frozen header
>   pane, per-column widths, and five cell styles that are ALL
>   `horizontal="right"` + `readingOrder="2"`.
> · **THE READING ORDER IS THE HALF THE VIEW FLAG CANNOT DO.** `rightToLeft`
>   on the sheet flips the COLUMNS; a cell whose text begins with a Latin
>   character — a Waze link, an English yeshiva name — still lays out
>   left-to-right INSIDE itself. `readingOrder="2"` is what fixes that, and
>   the farms template is mostly links.
> · **ENTRIES ARE STORED, NOT DEFLATED, ON PURPOSE.** The file is ~15 kB of
>   XML; a deflate implementation to save 6 kB would be the largest and least
>   testable part of the unit, and `CompressionStream` is not in every runtime
>   the verification scripts use. The DOS timestamp is FIXED for the same
>   reason: the same template must produce the same bytes, or a byte
>   comparison becomes a test of what time it is.
> · **A SECOND SHEET, "הוראות מילוי".** Do not rename the headers (that is how
>   columns are recognised), the grey rows are examples, extra columns are
>   ignored, required columns must have a value — and the one that costs an
>   afternoon: a SHORTENED map link carries no coordinates, so the row imports
>   and is badged מיקום חסר. Then a table of every column with its required
>   flag and its example.
> · **AN INVALID ATTRIBUTE WAS CAUGHT BY A THIRD READER, NOT BY US.** The first
>   version also put `rightToLeft="1"` on `<workbookView>` so the sheet TABS
>   would start on the right. `CT_BookView` has no such attribute: openpyxl
>   refused the whole workbook with `unexpected keyword argument
>   'rightToLeft'`, which is what Excel's repair dialog would have done to the
>   PO. Right-to-left is a per-SHEET attribute, full stop. A67 now asserts its
>   ABSENCE from the workbook view, because putting it back is the tempting
>   mistake.
> · **THE CSV EXPORT DID NOT EXIST.** `sampleCsv` was in `import.ts`, described
>   as "retained for the fallback path only", and called from NOWHERE — G10
>   replaced it and left it behind. Deleted: dead code documenting an
>   unreachable fallback makes the next reader budget for a path that is not
>   there. The two rules it carried are written into the comment that replaces
>   it, in case a CSV export is ever wanted back — the column order is the
>   template's own, and the file must open with a UTF-8 BOM or Excel on a
>   Hebrew Windows machine renders the headers as mojibake. The app still
>   READS an uploaded .csv; SheetJS handles that encoding.
> · **`bun run import` is the second proof and it was already there:** it
>   downloads each template, reads it back with SheetJS outside the browser,
>   refills it and uploads it through the wizard's own file input. 29 checks,
>   green — so the app can still read its own template.

> **P0bis.5a — THE EMAIL FIELD, AND WHY IT IS OPTIONAL EVERYWHERE.**
> · `email: string` on **Volunteer, Driver and FarmContact**; `''` means "no
>   address", which is a FACT about that person, not a missing value. It stays
>   optional by design: a yeshiva student with a kosher phone frequently has no
>   address, and a required field would either block his import or invite a
>   fake one — worse than nothing, because it looks like a channel that works.
> · `normalizeEmail` / `isEmail` / `mailtoHref` in `@core/messages`, beside the
>   phone helpers. The check is deliberately NOT RFC 5322: that grammar accepts
>   what no server delivers and rejects what every server does, and the two
>   mistakes do not cost the same. A false reject loses a real address read off
>   a business card; a false accept bounces one message.
> · Forms (volunteer, driver, farm contacts), both xlsx templates, the import
>   pipeline, and a column at `2xl` on both rosters — plus an envelope in
>   `ContactActions`, rendered ONLY when there is an address.
> · **A MALFORMED ADDRESS IS A WARNING, NOT A REJECTION** (`warnBadEmail`),
>   the same rule as מיקום חסר: the value is dropped and the coordinator is
>   told. Importing `0501234567` as an address would create a channel that
>   silently never delivers.
> · **THE FIXTURE NEARLY RE-ROLLED ITSELF.** The first version derived the
>   generated volunteers' addresses from `rng()`. Every other field in
>   `generate.ts` comes out of ONE seeded sequence, so drawing one extra number
>   shifted every subsequent draw and silently re-rolled all 275 volunteers —
>   different localities, different phone types, 254 active became 250. It is
>   derived from the INDEX now. The only reason it was caught is that
>   `bun run accept` prints the number.
> · **`scripts/import.ts`'s fixtures are keyed by HEADER now, not positional.**
>   Adding one column shifted three arrays and failed three checks for a reason
>   unrelated to what they test. The keyed version needs the same
>   longest-key-first rule `guessField` needs, and for the same reason: "איש
>   קשר" is a substring of "טלפון איש קשר", so a first-match-wins scan puts the
>   contact's NAME in the phone column. It did, on the first run.

> **P0bis.5b/c — THE SENDING CENTRE, AND THE LAW THAT SHAPES IT.**
> · **NO THIRD-PARTY APP MAY SEND A WHATSAPP OR AN SMS FOR A USER, OR CREATE A
>   WHATSAPP GROUP FOR HIM.** That is not a limitation of this build; it is the
>   platform. The WhatsApp Business API can — paid, behind Meta's approval —
>   and is recorded in §11 as a future step IF the association funds it. So
>   every button here is a HAND-OFF: it opens the coordinator's own app with
>   the message already written and he presses send. **Email is the exception**
>   — a server can send it, and P3.3bis will. The screen says all of this out
>   loud, because a coordinator who does not know why nothing sends itself
>   assumes the app is broken.
> · **THE TICK IS THE ONLY RECORD THAT EXISTS.** The app cannot know a message
>   was sent, so the screen is a CHECKLIST, not a status. That checklist is
>   what stands between a decision at 16:00 and a volunteer at a farm gate at
>   21:30 for a night that is not happening.
> · **`src/core/outreach.ts`** — pure: `channelsFor` (smartphone → WhatsApp,
>   kosher → SMS, **plus** email when there is an address),
>   `outreachRecipients`, `smsGroupRecipients`, `emailRecipients`,
>   `buildOutreachMessage` (one writer for all three events; the kosher branch
>   carries NO LINK — a phone with no browser turns a Waze URL into 60
>   characters of noise in a 160-character SMS), `buildGroupKit`.
> · **THE RECIPIENT LIST IS DERIVED, NOT SNAPSHOTTED.** G9bis stored a
>   `CancelNotice[]` pre-populated at cancel time; a driver added afterwards
>   was then invisible on the very screen whose job is "who has not been told".
>   `Mission.cancelNotices` became `Mission.outreach` — TICKS ONLY, one entry
>   per person actually ticked, keyed by event — and the list is recomputed
>   from the mission every render. `setCancelNoticeSent` → `setOutreachSent`,
>   an upsert; un-ticking DELETES the entry, so "no entry" means exactly one
>   thing.
> · **ONE MESSAGE WRITER, NOT TWO.** `buildCancellationMessage` is gone: a
>   second builder producing a nearly-identical message for one of three events
>   drifts from the other two within a lot. The cancellation panel keeps its
>   banner and delegates its list to the same `OutreachPanel`, which is also
>   how the cancellation gained the email channel it never had.
> · **A REAL DEFECT THE GATE FOUND, AND IT WAS INVISIBLE.** `smsHref` ran its
>   argument through `digits()`, which strips everything that is not a digit —
>   including the COMMA that separates recipients. The grouped SMS produced
>   `sms:0530000019050000002`: a single number belonging to nobody, inside a
>   link that looks perfectly well-formed. A test that checked the button
>   exists would have passed; A68 decodes the href, so it failed.
> · **THE GROUP KIT (P0bis.5c).** Three copies and three pastes: the name
>   (`שמירה <entity> <date>`), the numbers, the opening message, with the
>   three-step guide beside them. The numbers are INTERNATIONAL (`+972…`) —
>   WhatsApp's own participant search matches nothing else — and include the
>   coordinator, because a group he is not in is a group he cannot read at
>   02:00. **Kosher phones are EXCLUDED and named as excluded**: a number in
>   that list that silently never joins would leave the coordinator believing
>   somebody is in the group when he is not, which is the exact failure the
>   centre exists to prevent. They are covered by the grouped SMS instead.

> **G13 — THE POC IS FROZEN.** Tag `poc-final`, and a byte-for-byte copy of the
> built app committed at `public/poc/`, served from
> https://azmer-fts.github.io/lo-yanum/poc/ .
> · **WHY `public/` AND NOT A SECOND DEPLOY.** Vite copies `public/` verbatim
>   into `dist/`, so the snapshot rides along with every later build without
>   being rebuilt. A second Pages deployment would have been a second thing to
>   keep working; a committed directory is inert by construction.
> · **IT WORKS FROM A SUBDIRECTORY BECAUSE `base` IS `'./'`** — every asset
>   path in the built `index.html` is relative, and the router is a HashRouter,
>   so `/poc/#/coordinator` resolves without a second build. Verified by
>   serving `dist/` locally and opening the sub-path before pushing.
> · **NEVER `cp dist/. public/poc/` A SECOND TIME.** After the first freeze
>   `dist/` CONTAINS `poc/`, so copying it back nests a snapshot inside a
>   snapshot. `public/poc/FROZEN.md` says so, in the one place somebody about
>   to do it will be looking.

> **THE FINAL ORDER OF MARCH (product-owner prompt, 2026-08-30).** The product
> owner starts field work in TWO DAYS on an iPad Pro 13" (+ iPhone). The goal
> is a REAL tool — online, usable offline — by the end of this order. Four
> phases, in this order:
>
> · **P0** — last UX asks. ✅ DONE (see below).
> · **P1** — finish the POC: **G10 ✅ → G18 ✅ → G12 → G13**, specs already in
>   this file. (G11 is folded into G12's iPad pass; P0.3 already did the touch
>   half.)
> · **P2** — LOT 1, THE REAL THING: Supabase project `lo-yanum-prod`
>   (eu-central-1 Frankfurt, PO's org — **ASK BEFORE CREATING**), additive SQL
>   migrations for the whole mock model, RLS transcribed from `access.ts`
>   policy by policy, email/password auth with ONE coordinator account (the
>   PO's email — ask), private `photos` + `agreements` buckets behind signed
>   URLs, and the OFFLINE LAYER (IndexedDB read cache, an outbox for writes
>   with a visible "N ממתינים לסנכרון" badge, last-write-wins per changed
>   field, a service worker pre-caching the Negev OSM tiles ~50–80 MB with a
>   "רענן מפות לא מקוונות" button in a small הגדרות screen). The mock store
>   becomes the "demo" implementation behind an interface a Supabase
>   implementation also satisfies — NO screen changes. The real app starts
>   EMPTY; /poc keeps the demo data.
>   Criteria B1–B4.
> · **P3** — LOT 2 ESSENTIAL: real import into Supabase, real photos
>   (camera/file → client compression → bucket), agreement signing (finger
>   canvas → PDF with a clearly-marked PLACEHOLDER agreement text → bucket →
>   status נחתם), final PWA (manifest, icons, iOS/iPadOS install, הגדרות
>   page), deployment stays the evolving GitHub Pages URL.
>   Criteria B5–B8.
>
> Then a FINAL REPORT in French: both URLs, phase status, the login
> credentials to agree with the PO, a numbered field checklist per device, and
> step-by-step PWA install instructions for the iPad.
>
> **PO DECISION, 2026-08-30 — THE DISPLAY FACE IS FRANK RUHL LIBRE**, which
> REVERSES the 2026-08-19 arbitrage of Heebo. Done in commit 70e4469: the two
> OFL woff2 came back from `09b43f5^`, `--font-brand` names them, and Heebo
> left the bundle entirely, so A60 still reads "one display face ships". The
> numeric escape hatch stays load-bearing — Frank Ruhl Libre HAS digits, so
> `.text-display.numeric` and its three siblings must keep falling back to
> Rubik or every KPI goes serif and stops aligning.
>
> **P0 — DONE, three commits:**
> · **P0.1** (5439488) — the map is MODULAR on every map-first screen:
>   מוסתר / מפוצל / מלא, switchable by visible 44 px buttons, persisted PER
>   SCREEN in localStorage (`lo-yanum:map-mode:<screenKey>`). `useMapMode` +
>   `MapModeSwitch` in `ui/components/mapMode.tsx`; `MapPanel` takes a
>   `screenKey` and the farm detail wires the same hook by hand. `split` is
>   byte-for-byte the Lot 0.9 reading and stays the default. Screens:
>   dashboard, farms, farm-detail, route-planner, incidents, missions, plus
>   volunteers and drivers via P0.2. The map is `display:none` in `hidden`,
>   NOT unmounted — unmounting tears down the WebGL context and the camera
>   with it; MapCanvas's ResizeObserver calls `map.resize()` on the way back.
>   ONE switch is on screen at a time: below the breakpoint the map's own
>   header bar carries it and the content copy stands down, except in
>   `hidden` where no bar is left. Not to be confused with `useMapFullscreen`
>   (a viewport-takeover overlay armed from the map's toolbar) — the two
>   compose. A61.
> · **P0.2** (5a344d5) — the two rosters get a map that COUNTS: one bubble per
>   יישוב, area-proportional (`clusterByLocality` + `bubbleDiameter`, pure, in
>   @core/geo, tested as A62 in accept.ts), the count written inside, tap to
>   filter the table. The filter COMPOSES with the KPI-filters and the
>   existing "ניקוי" clears everything; the tapped town also reads back as a
>   removable pill so a filter set on the map survives the map scrolling off.
>   No per-person pin — the programme holds a home town, not an address — and
>   a locality outside the gazetteer is REPORTED, never dropped. NOT
>   `MapPanel`: both rosters are G7 window-virtualised tables whose scroll
>   surface is the page, so the map is a block ABOVE the table
>   (`ui/components/PeopleMap.tsx`) sharing the switch, the key space and the
>   hidden rule. The table is UNMOUNTED in `full`, never `display:none` — a
>   hidden virtualiser measures a scrollMargin of 0 and comes back drawing
>   rows a page above themselves. New `bubble` marker kind, translucent so
>   overlapping towns sit in front of each other. Also: VolunteersScreen
>   carried a literal NUL byte (the `|| '\0'` phone-search sentinel) that made
>   git treat the file as BINARY and its diffs unreviewable — now a space,
>   identical behaviour.
> · **P0.3** (04ba9aa) — the touch pass, and `bun run touch` is its proof.
>   `wrapForTouch` in MapCanvas leaves every marker's DRAWING alone and
>   expands its HIT area to 44 px (the trick the G1 vertex grip already used);
>   teardrops need no offset because their tip is the coordinate and the box
>   grows upward only. That widening created a trap the script then caught:
>   markers stop their click reaching the map (decision 51), and at 44 px the
>   transparent corners swallow taps that look like empty map — so an ARMED
>   map now suspends the guard for every kind, draggable included, applied to
>   the finished element in the markers effect so the early-returning vertex
>   and draft kinds cannot miss it. A63.
>
> **P1 — G10 IS DONE.** The import stopped being "the volunteers CSV" and
> became THREE rosters behind one pipeline, at `/coordinator/import/:kind`
> (the old `/volunteers/import` redirects — it is in the PO's history and in
> the Lot 0.9 captures). What is worth knowing:
> · **`src/core/templates.ts` IS THE SOURCE OF TRUTH.** A template is a list
>   of COLUMNS carrying their own label key, their own aliases, whether they
>   are required, three example cells and a width. The downloadable file, the
>   header guess, the mapping step's options and the required-columns check
>   are all DERIVED from it. Before this the columns were declared in three
>   places that had to agree by hand, and disagreeing produced a template the
>   wizard could not read — which looks to the coordinator like HIS file is
>   wrong.
> · **`guessField` matches the LONGEST alias first, across the whole
>   template.** "סוג טלפון" contains "טלפון" and "טלפון איש קשר" contains it
>   too; a first-match-wins scan in column order imports "כשר" as somebody's
>   phone number. Sorting by length is what survives someone adding a column.
>   Same trick for the Hebrew status dictionary, where "נוצר קשר" and
>   "ליצירת קשר" share "קשר" and reversing them would tell the coordinator he
>   has already called a farmer he has not.
> · **THE TEMPLATE IS AN .xlsx**, generated through SheetJS on demand, with
>   RTL sheet views and per-column widths. A CSV still mojibakes on a Hebrew
>   Windows machine often enough to matter.
> · **A SHARED PIN BECOMES A COORDINATE** (`parsePositionInput` in @core/geo):
>   Waze `?ll=`, its URL-encoded form, live-map `to=ll.`, Google `@lat,lng,15z`,
>   our own `?query=`, and a bare pair. Validated against an ISRAEL BOUNDING
>   BOX, which is what stops a zoom level being read as a longitude and what
>   silently corrects a reversed pair. A SHORTENED link (`maps.app.goo.gl`)
>   carries no coordinates at all — the position is behind a redirect that a
>   browser cannot follow cross-origin — so it returns null and
>   `isUnresolvableLocationLink` says so out loud.
> · **מיקום חסר IS A WARNING, NOT A REJECTION.** A farm whose link could not
>   be read still imports, parked on HOME_BASE, badged, and counted in its own
>   "דורשות השלמה" chip. Refusing it would push the work back into a
>   spreadsheet when dragging a pin takes four seconds. The preview tells the
>   three position facts apart — from the link / from the locality
>   (APPROXIMATE — the middle of a town, routinely 3 km out) / missing —
>   because they call for three different actions.
> · Farms de-duplicate BY NAME (they have no phone of their own), volunteers
>   and drivers by normalised phone. Imported dunams come in flagged MANUAL, so
>   G15's `syncZoneDunams` will not overwrite the farmer's own claim the first
>   time somebody draws a zone.
> · `bun run import` is the criterion's real proof: it downloads each
>   template, reads it back with SheetJS OUTSIDE the browser, refills it,
>   uploads it through the wizard's own file input and finds the records in
>   the roster. 28 checks. Everything between "download" and "upload" is where
>   an import breaks, and it breaks silently.
> · **Watch out:** `scripts/` is NOT in tsconfig's `include`, so `bun run
>   typecheck` does not see it. Changing a @core signature can leave a script
>   silently wrong — it did here (A9 passed an array where an object was now
>   expected and lost two checks). Run `bun run accept` after any core
>   signature change, not just the typecheck.
>
> **P1 — G18 IS DONE.** The threat layer, and it is the one genuinely
> SENSITIVE thing in the model:
> · **`ThreatZone` and `ThreatVector`** (types.ts), both with `farmId:
>   string | null` — attached to an entity, or FREE at map level, because a
>   threat does not respect a fence line and the ones that matter most sit
>   BETWEEN holdings. Both carry `intensity` (נמוך/בינוני/גבוה) and an
>   `updatedAt` the STORE stamps on every write, including a vertex drag: a
>   date a caller supplies is a date a caller can forget to bump, and a threat
>   map with no age invites acting in 2027 on a 2025 assessment.
> · **THE GATE IS IN `access.ts`, NOT IN A SCREEN.** `getVisibleThreatZones`,
>   `getVisibleThreatVectors` and `getThreatsForFarm` return `[]` for every
>   role but the coordinator. The consequence is deliberate and tested: a
>   FARMER IS REFUSED THE LAYER FOR HIS OWN FARM. The assessment names
>   patterns across holdings and is the programme's to hold. A59 exercises all
>   three roles through all three routes.
> · `getThreatsForFarm` deliberately includes the FREE shapes as well as the
>   attached ones — a threat between two holdings is the one a coordinator
>   most needs while looking at either of them.
> · **TWO HUES AND A WEIGHT, NOT THREE HUES.** Decision 49 keeps `--critical`
>   for four meanings and a threat assessment is none of them, so the ladder is
>   `--status-warn` → `--status-danger` and the third rung is DENSITY: a
>   double-stripe hatch and a heavier outline. Better encoding anyway —
>   density survives a sun-washed iPad and colour-blindness.
> · **THE TEXTURE IS THE POINT.** A hatch (a generated 16 px canvas per
>   intensity, `fill-pattern`) plus a DASHED outline, so the layer reads as an
>   overlay rather than as terrain before any colour is decoded — on a map
>   that already spends four tints on ground (G16).
> · A vector is TWO map clicks (origin, then target) and renders as two
>   features: a LineString shaft and a Point head whose `icon-rotate` takes
>   `bearingDeg` (new, pure, in @core/geo), with `icon-rotation-alignment:
>   'map'` so a two-finger twist does not leave every arrow lying. The head is
>   registered at pixelRatio 1: at 2 it came out ~9 px and a vector was
>   indistinguishable from a line, which defeats the object.
> · Surfaces: the farm/moshav detail (draw + the editable `ThreatPanel`), the
>   global farms map behind a remembered **שכבת איומים** toggle (OFF by
>   default — the global map's job is "where are my farms"), and WIZARD STEP 1
>   read-only, which is the layer's reason to exist: a post is placed FACING
>   the approach.
> · **Creation is only offered on an entity's map, by design.** That is the
>   one map in the app carrying a drawing instrument; bolting a polygon editor
>   onto the global reading surface would give the same gesture two homes. The
>   free-standing case is reached by DETACHING from the panel ("בטל שיוך"),
>   which covers both states of the model with one editor.
> · `window.__loYanumMap` is published from MapCanvas's `load` handler — a
>   handle for the verification scripts, since a MapLibre instance is
>   otherwise unreachable from outside React. Published on LOAD, not on
>   create: React's dev-mode double mount would otherwise leave it pointing at
>   the corpse of the first map.
> · **Environment note:** the in-app Browser pane stopped loading OSM tiles
>   part-way through this session and `map.on('load')` never fired there.
>   Playwright was unaffected. If a map looks empty in the pane, verify with a
>   script before believing it.
>
> **P1 — G12 IN PROGRESS.** Two real defects were found by the capture run
> itself, both fixed before the set was regenerated:
> · **The map column COLLAPSED in `full` mode below the breakpoint.**
>   `lg:flex-1` does nothing while the row is still a column, so the map fell
>   to zero height and the floating legend rode up over the page header. It
>   had never been seen because the hand test of `full` was at 1032, which is
>   ≥ `lg`. Both MapPanel and the farm detail now carry `min-h-0 flex-1` in
>   `full`.
> · **The capture set was ORDER-DEPENDENT.** Shot 29 leaves the farms map on
>   `full` in localStorage (that persistence is the point of P0.1), so shot 32
>   — the threat layer — opened full-screen with the toggle it was supposed to
>   press hidden behind the content column it had just closed. Every shot now
>   clears `lo-yanum:map-mode:*`, `lo-yanum:threat-layer` and sessionStorage
>   before it runs. A reference set that depends on its own order is not a
>   reference.
> · `bun run layout` gained VIEWPORTS (G11 folded in): `phone` 390 (default),
>   `iphone` 402×874, `ipad` 1032×1376, `ipad-ls` 1376×1032, or `all`. The
>   screenful cap travels with the viewport, because the same page is fewer
>   screenfuls on a taller device.
> · That sweep found one thing, and it was a FALSE POSITIVE IN THE AUDIT, not
>   a defect in the app: at 402×874 the mission detail's presence table put its
>   `sticky` header under the demo toolbar and A24 called it a pinned overlap.
>   A sticky header inside a `.table-scroll` box is pinned to THAT BOX — the
>   page scroll separates it from the toolbar like any ordinary element — so
>   the check now skips any sticky element with a scroll-container ancestor.
>   Deliberately NOT conditional on whether that ancestor currently overflows:
>   a box holding three rows today holds thirty tomorrow, and a layout gate
>   whose verdict depends on how much data is in the fixtures is not a gate.
>   `position: fixed` is still always in scope, and so is the volunteers
>   roster's column header — G7 made the WINDOW its scroll container, so it
>   really is viewport-pinned, which is the case the check exists for.
> · `public/manifest.webmanifest` carried the PRE-G17 forest greens
>   (`#07180F`) as its theme and background colour — the installed PWA would
>   have flashed the retired identity on every launch. Now `#0B1119`, the G17
>   night surface. `orientation` went from `portrait-primary` to `any`: the
>   one device this app exists for is an iPad that gets read in landscape and
>   drawn on in portrait, and rotate-locking it would be a field defect.

> **SPEC GAP RESOLVED (2026-08-19).** The product owner re-sent the missing
> sections in the prompt "LOT 0.10 — SECTIONS MANQUANTES G14–G16 + DÉCISIONS
> PO + ORDRE FINAL" and fixed the remaining order:
> **G14 → G15 → G16 → G10 → G18 → G11 → G12 → G13.**
> (G16 before G10 on purpose: the סוג יישות column of G10's חוות template
> depends on the entity type G16 introduces.)
>
> Two PO decisions arrived with it (checked at G12 as **A60**):
> · **The Artzenu MARK is retired** — landing + rail, and the asset leaves
>   the repo (grep-verified). The landing keeps לא ינום + the verse only.
>   This closes the "does the mark stay?" question G17 left open.
> · **Heebo is the display face.** Frank Ruhl Libre and Secular One leave
>   the final bundle; the /styleguide arbitrage section retires with them.
>
> **G14 — NUMBERS AT A GLANCE** (principle: the PO drives — key numbers on
> top, big; the long reading stays below):
> · a) DASHBOARD: two strategic KPIs FIRST — "דונם בשמירה" (sum of farm +
>   grazing dunams over signed/active entities) and "דונם פוטנציאלי" (sum
>   over non-signed non-refused). The association's budget number: big, first.
> · b) DASHBOARD ALERTS: compact FULL-COLOUR rows by severity (icon + title
>   + relative time only), collapsed by default; click → expands to the
>   current details and actions.
> · c) FARM DETAIL: map-first gabarit like the other screens — map on the
>   LEFT at full height (~55-60 %), content right. AT THE TOP of the content:
>   a key-numbers band in big type (farm dunams / grazing dunams / status /
>   next visit / last activity). Fix the truncated status pill in the
>   stepper. Timeline/recent activity raised high. Signed agreement: view
>   the PDF + download + SHARE (Web Share API / wa.me) — mock embedded PDF.
> · d) KPI-FILTERS on the lists (volunteers/drivers/farms): the top number
>   cards BECOME the clickable filters (visible active state, "נקה");
>   redundant pills deleted; the sticky wraps EVERYTHING at the top (title +
>   KPI + search + column headers). Enriched: volunteers (active, inactive,
>   smartphone, kosher, licence+car, never guarded); drivers (total,
>   cumulative seats, ≥7 seats, available tonight); farms (by status +
>   dunams).
>
> **G15 — ZONE EDITING + LIVE AREA:**
> · a) Editing an EXISTING polygon must be obvious: click on a zone →
>   selection → handles (existing) + ADD a vertex on an edge (click the edge
>   midpoint) + move the whole polygon (drag) + delete. An "ערוך" button per
>   zone in the list.
> · b) LIVE AREA: geodesic area in DUNAMS in /src/core/geo.ts (pure,
>   tested), displayed LIVE while drawing/editing (label on the polygon +
>   panel). The "שטח החווה"/"שטח מרעה" fields auto-fill (sum per type);
>   manual override stays possible and is flagged "מוזן ידנית".
>
> **G16 — ENTITY TYPE: חווה / מושב** (field-expert feedback): a "סוג יישות"
> field (חווה / מושב / אחר) — distinct map marker for מושב (village glyph),
> filter + KPI in the list, adapted labels ("גבול היישוב" when מושב), same
> zones/guards/posts mechanics. 2 mock moshavim. ZONE COLOURS — 4 distinct
> tints because a moshav can adjoin a farm: גבול חווה = tint A (outline +
> ~8 % fill); שטח מרעה חווה = lighter A′; גבול מושב = clearly different
> tint B; שטח מרעה מושב = B′. Legend updated everywhere; visual check with
> the mock moshav adjacent to a farm (A58/A55).

> **LOT 0.10 RESUME POINT.** The lot's full spec is the user prompt titled
> "LOT 0.10 (VERSION FINALE UNIQUE)", AMENDED mid-lot by the prompt "AJOUT AU
> LOT 0.10 EN COURS — G7bis" (2026-08-18, after product-owner review of the
> farm-detail screenshots), and by the 2026-08-18 update above. Section order
> was G0 → G2 → G1 → G8 → G5 → G3 → G4 → G6 → G7bis.1-3 → G9 (incl. G7bis.4)
> → G7; then **G17 was pulled forward** (an identity change belongs under all
> later visual work) → **G10 → G18 → G11 → G12 → G13**, with G14–G16 slotted
> wherever their re-sent spec says.
>
> DONE (each is one commit, in git log order): G0 (עמדת שמירה rename +
> dunams), G2 (PinMap + AutocompleteField + farm-form audit), G1 (FarmZone
> model/editor/tokens `--zone-*`), G8 (Mission pickup/dropoff points, 'car'
> marker, meet.tsx, buildDriverMessage), G5 (Mission.drivers[] replaces
> driverId, DriversScreen + DriverFormModal, dual-hat volunteerId link,
> capacity-sorted wizard step 4), G3 (pre-composed step 2, search + org
> filter, virtualised candidate list, availability soft-scoring in
> dispatch.ts), G4 ('recruiting' MissionStatus + requiredVolunteers,
> 3-of-5 dialog, ?resume= wizard pre-fill, updateMissionStaffing,
> escalating dashboard alerts), G6 (GeneralMeeting object/modal, 3-type
> agenda + chooser, day view, visit/meeting drag-and-drop — guards
> deliberately not draggable), G7bis.1 (marker iconography: shape+glyph+
> colour per point kind, --marker-farm token, postColor()/farmMarkerColor(),
> shape-true legends via MarkerSwatch, wizard.ts selector updated), G7bis.2
> (fullscreen working mode on AnchorMap/meet/PinMap/mission-detail maps —
> fullscreen.tsx, ResizeObserver in MapCanvas, armed modes eat Esc first),
> G7bis.3 (farm detail as two tracks from xl: 60 % map-at-56dvh + posts +
> guards + incidents, 40 % identity/contacts + CollapsibleSection blocks with
> sessionStorage memory; one column below xl BECAUSE iPad portrait is 1032),
> **G9** (planner↔agenda bridge: Tour object upserted per day + buildDayPlan
> engine in core/tours.ts folding the drive around meetings/visits as walls
> — guard missions shown but deliberately NOT walls; "היום שלי" block on
> dashboard + agenda day view; planner takes ?date=, lists the day's
> constraints, saves/deletes the tour, arrival time per stop; קביעת פגישות
> panel with per-stop call + pre-filled visit modal; suggestions by cheapest
> triangle-detour insertion; G7bis.4 "צור מסלול ליום זה" from day view and
> every week/month day menu — A50 flow works, scripted proof due at G12),
> **G9bis** (guard cancellation A45/A46: 'cancelled' status + required
> reason from closed list + note, cancelMission snapshots per-recipient
> notices (volunteers, drivers, farmer) with buildCancellationMessage and
> sent-tracking; reactivation to 'recruiting' resets driver confirmations
> and banners "reconfirm everything"; cancelled guards excluded from
> tonight/upcoming/past AT THE ACCESSOR, surfaced only in the missions
> screen's בוטלו tab and struck-through in the agenda; mission-07 seeded
> cancelled), **G7** (full-page tables: useWindowTable hook — WINDOW
> virtualisation with a measured scrollMargin, because the naive
> `offsetTop ?? 0` draws rows ~1000px below their slot and blanks the page;
> sticky column headers at `top: var(--shell-top)` with NO overflow-hidden
> ancestor; volunteers gain licence+car icons and a compressed availability
> column at xl; DriversScreen rebuilt as the same table; farms gain a
> מפה/טבלה toggle whose table reading is full-page OUTSIDE the map shell
> because a table cannot live in the shell's one-third panel — the map
> stays the default so A18 holds; dashboard KPIs moved to text-display;
> scripts/layout.ts now sweeps 23 screens: drivers added, volunteers
> A30-exempt with the reason printed), **G17** (the NEUTRAL IDENTITY, PO
> decision of 2026-08-18 — Artzenu colours AND faces retired: Atlas/Mekomi
> deleted (licence question closed), Rubik = body/UI/every number, Frank Ruhl
> Libre (OFL, self-hosted woff2, full nikkud verified on the landing capture)
> = display, Secular One + Heebo self-hosted as the two /styleguide
> alternatives awaiting the PO's arbitrage; light = barely-tinted grey page /
> white cards / grey-black ink, dark = neutral blue-grey, accent = one
> professional blue, statuses/zones/critical stay vivid; cards/tiles/callouts
> lost their contour (shadow + luminance only, callouts became start-bar +
> tint like card-critical), fields KEEP their 1.8-pinned hairline; button
> hierarchy = primary/danger/critical rectangles at 6px vs secondary/filter
> pills vs icon call buttons, enforced with the no-contour rule as **A57** in
> scripts/tokens.ts; body raised one notch (16/13.5/11.5 px) with layout
> green; landing plate now slate (--plate-from/--plate-to, audited);
> `.numeric` at heading scales explicitly falls back to Rubik because Frank
> Ruhl Libre HAS digits where Atlas shipped none; contrast/tokens/accept/
> dispatch/layout/wizard/build all green; captures 1-2/9-10/21-22 refreshed),
> **PO decisions 2026-08-19** (the Artzenu mark left the repo — landing is
> לא ינום + verse only, `imprint` prop and `.artzenu-mark` deleted; Heebo is
> THE display face, Frank Ruhl Libre + Secular One woff2 deleted, /styleguide
> arbitrage reduced to the verdict; index.html boot theme-color updated to
> the G17 night value; A60 ready), **G14** (the numbers lead: a) `getDunamKpis`
> in @core — דונם בשמירה = signed+active, דונם פוטנציאלי = pipeline minus
> declined — shown as the dashboard's two biggest figures, first, and
> recomputed independently in scripts/accept.ts (A52, 67 checks green);
> b) dashboard alerts are compact FULL-COLOUR rows (bg-critical, or amber
> bg-status-warn for calm recruiting), collapsed by default, click →
> aria-expanded detail with the call list; c) farm detail became map-first
> (bleed route via isBleedPath — `new`/`edit`/anchor sub-routes stay padded
> forms; AnchorMap gained `flush` for square corners; content column
> xl:w-[42%] scrolls alone; KeyNumbers band first: both dunams at
> text-metric + status chip + next visit + last activity; stepper ring
> un-clipped by `-m-1 p-1` on the scroll row + whitespace-nowrap; activity
> Timeline raised above the fold; AgreementActions = view/download/share —
> Web Share, wa.me fallback — over public/mock-agreement.pdf, a real 1-page
> PDF committed as mock; src/vite-env.d.ts added for import.meta.env);
> d) KpiFilter primitive (the card IS the filter, aria-pressed + accent
> ring, dot/hint variants) on volunteers (6 KPIs incl. licence+car and
> never-guarded, VolunteerStats extended), drivers (total-as-clear, seats
> Stat, 7+ seats, free-tonight via getTonightBookedDriverIds — a cancelled
> guard releases its driver), farms (per-status cards weighted in dunams,
> status pills deleted, type pills stay); from lg the WHOLE top — title +
> KPIs + search + column headers — is ONE sticky block at --shell-top with
> the rows card `lg:rounded-t-none` (`t-none` joined the tokens.ts radius
> allow-list); below lg it scrolls away, a phone cannot afford a 300 px pin
> — A51's sticky proof runs at desktop width), **G15** (zones are editable
> ground: click a zone or its ערוך in the farm detail's new zones list →
> emphasised drag-vertices + midpoint grips that INSERT a vertex + a
> four-way centre handle that drags the whole ring + delete; zone selection
> is CONTROLLED on the farm detail (AnchorMap keeps internal state
> elsewhere); `ringAreaDunams` (spherical excess) + `ringCenter` in
> @core/geo, tested in accept.ts (±1 % vs planar reference, winding/
> translation-proof, A54 — 73 checks green); live area chip rides the
> polygon while drawing/editing via a new non-interactive 'label' marker
> kind (offset above the move handle) and repeats in banner + toolbar;
> store gained ONE writer `syncZoneDunams` — every zone mutation AND the
> seed fold per-kind sums into שטח החווה/שטח מרעה unless flagged
> `farmDunamsManual`/`grazingDunamsManual` (optional on Farm, so fixtures/
> imports stay valid); farm form shows each dunam field's provenance
> (מוזן ידנית chip + "back to the map's sum", or the sum named as source),
> typing flips the flag, updateFarm resyncs on submit; farm-08 grazing =
> 3900 is the seeded override; the DASHBOARD dunam KPIs now read the synced
> values — the seed numbers changed, A52 recomputes so it stays green),
> **G16** (סוג יישות on Farm — `entityKind?: 'farm'|'moshav'|'other'`,
> absent = farm, read via `entityKindOf`; new 'moshav' MarkerKind with a
> village glyph (`entityMarkerKind` in badges.tsx swapped in at every farm
> marker call site incl. dashboard/farms/route/anchor-form/meet); FOUR zone
> tints — `--zone-boundary-moshav`/`--zone-grazing-moshav` blues in both
> themes + the system-dark media block; zoneColor/zoneLabelKey/zonePolygons/
> ZoneLegend take the entity (legend shows up to 4 rows on mixed maps, the
> single-entity form on the detail screen via `entity` prop); adapted labels
> גבול היישוב / שטח היישוב / צייר גבול יישוב + PointLegend המושב; farms list
> gained the מושבים KPI-filter (dunam-weighted) and the form the סוג יישות
> select (FarmDraft carries it); mocks: farm-13 מושב רתמים ADJOINS farm-01's
> grazing at 34.672°E (the A55 adjacency), farm-14 מושב באר חיל contacted;
> accept: A4 farm count 12→14, new A55 section — 77 checks green; layout 23
> screens + wizard 28 + tokens/contrast/dispatch/build all green).
>
> REMAINING (in this order): G10 (templates.ts source of
> truth + הורד תבנית xlsx generator + farms/drivers import with Waze-link
> parsing + מיקום חסר badge **+ the סוג יישות column from G16**), **G18** (threat zones + attack vectors, coordinator-only: new zone
> type "אזור איום" drawn like other zones in an explicit mode, red/orange
> hatched fill + dotted outline, fields intensity נמוך/בינוני/גבוה + note +
> displayed update date; new object "וקטור איום" = arrow placed in 2 clicks
> (origin then direction), red, note, editable/deletable; attached to an
> entity (farm/moshav) OR free at map level; visible on the global map behind
> a "שכבת איומים" toggle in the filter bar, on entity detail, and on wizard
> step 1 to place posts FACING the threat; access.ts hides the whole layer
> from farmer/volunteer/driver — sensitive data, tested; 2 mock zones + 2
> mock vectors in the Negev consistent with existing farms — criteria A59),
> G11 (iPad 1032×1376 / 1376×1032 + iPhone 402×874 perfection, safe areas),
> G12 (A1–A30 re-run + NEW A31–A44 **+ A47–A50 from the G7bis amendment,
> A56–A59 from the 2026-08-18 update, A51–A55 + A60 from the 2026-08-19
> re-send: A51 full sticky + clickable KPI-filters with "נקה" + zero
> duplicate pill at 300 volunteer rows; A52 correct דונם בשמירה/פוטנציאלי
> KPIs (recalc script from the mocks) + compact full-colour collapsed
> alerts expanding on click; A53 map-first farm detail (map left, numbers
> band, untruncated pill, PDF view/download/share); A54 existing-zone
> editing (move vertex + add vertex on edge + move polygon) + live dunam
> area auto-filled with flagged override; A55 moshav entity (distinct
> marker, adapted labels, list KPI/filter, 4 zone tints legible side by
> side); A60 Artzenu logo absent from the repo (grep), landing = לא ינום +
> verse only, one display face in the bundle** + light/dark captures incl. styleguide
> new identity, global map with threat layer on, farm detail with adjacent
> moshav + threat zone + vector + full ETAT rewrite — §8's contrast table
> below still shows pre-G17 values and G12 rewrites it — + deploy), G13 (tag
> `poc-final` + frozen copy at /poc/ + immutability rule). G14–G16: spec
> missing, see the SPEC GAP note above.
>
> G17 notes for G12: open question 8 (Artzenu font licences) is RESOLVED —
> all faces are OFL. `bun run brand-reference` and docs/brand-artzenu.md are
> retired/historical (the doc says so in its header). The Artzenu MARK
> question is now ANSWERED (2026-08-19 PO decision, A60): it goes — see the
> SPEC GAP RESOLVED note. A56 asks for a bigger body "si les gates
> layout passent": done, gates green.
>
> The G7bis amendment's acceptance criteria, to fold into G12's run:
> · A47 — the 4 point kinds are visually distinct (shape+icon+colour),
>   captures on farm detail AND mission detail.
> · A48 — fullscreen operational on farm detail and the wizard; a zone drawn
>   END-TO-END in fullscreen at iPad portrait 1032×1376. (Already exercised
>   by hand this session; needs its scripted/captured proof at G12.)
> · A49 — farm detail two columns at 1280 and iPad landscape, one column
>   with folding blocks at iPad portrait/402, map ≥50vh, alignments checked
>   by `bun run layout`.
> · A50 — "צור מסלול ליום זה" from the day view of a FUTURE day shows that
>   day's itinerary with its events (lands with G9).
>
> Verification note for G12: `bun run accept` was already adapted (driver
> scoping via drivers[], three agenda kinds); `bun run wizard` passes with
> the pre-composition flow AND the G7bis.1 teardrop markers (selector now
> matches teardrop+glyph, not the retired square). The G4.3 note "real push
> needs a backend (Lots 1+)" must survive into the final ETAT. A41's
> simple-version documentation: guards don't drag by design; visits/meetings
> drag on desktop, and each modal's date field is the mobile move.

> **Deployed and verified.** The first two attempts failed on `deploy-pages`
> with `HTTP 503` while githubstatus.com had Actions and API Requests at *major
> outage*; the third run went through and the live bundle was checked for Lot 0.9
> code (the map's "click to add a point" string and `btn-critical` are both in
> it). If a future deploy fails the same way, it is GitHub, not this repo — wait
> and re-run.
>
> Pushing needs the repo owner's account: `gh auth switch --user Azmer-FTS`. The
> machine's default account is `mgnamsellem`, which gets a 403 on this repo — a
> minute lost to that error once already.

---

## 2. Vision

A field coordinator enrols Negev farmers (signed agreement), then schedules
volunteer night guards (yeshiva students) and volunteer drivers who transport
them. Farms are remote; coverage is frequently zero. Some volunteers carry
"kosher phones" (calls + SMS only), so every guard group includes at least one
smartphone holder who acts for the group.

| Role | Sees | Default theme |
|---|---|---|
| **Coordinator** | Everything | **Light** (daylight desk work) |
| **Farmer** | Only his own farm | Dark |
| **Driver** | Only his own trips | Dark |
| **Volunteer** (group-phone holder) | Only his own guard | Dark |

---

## 3. Lot plan

| Lot | Scope | State |
|---|---|---|
| Lot 0 | Visual POC — 16 screens, mock data, role switcher | ✅ Done |
| Lot 0.5 | "Night Watch" redesign, editing flows, nominative confirmation | ✅ Done |
| Lot 0.6 | Map-first everywhere, light/dark themes, hierarchy, photos, tap-to-call | ✅ Done |
| Lot 0.7 | Command-centre palette, agenda, guard wizard, timelines | ✅ Done |
| Lot 0.8 | Artzenu brand charter — palette, typography, mark | ✅ Done |
| **Lot 0.9** | **UX/UI finishing: guard wizard, fields, rhythm, maps** | ✅ **Done** |
| Lot 1 | Supabase: schema, auth, RLS mirroring `/src/core/access.ts`, Storage for photos | Not started |
| Lot 2 | Offline-first sync | Not started |
| Lot 3 | Real agreement signing + PDF storage | Not started |
| Lot 4 | Scheduling assistance (promote `dispatch.ts` from proposal to automation) | Not started |
| Lot 5 | Notifications (SMS gateway for kosher phones, push for smartphones) | Not started |
| Lot 6 | EN + FR translations | Not started |

---

## 4. Lot 0.9 — delivered

The Artzenu charter was validated in principle and its EXECUTION tightened. One
blocking bug was fixed, and it is the one that shaped the whole lot.

| # | Scope | State |
|---|---|---|
| F1 | The guard wizard is no longer a dead end: a farm with no anchor point had a required, EMPTY select | ✅ |
| F2 | Wizard step 1 rebuilt map-first — a click on the map CREATES an anchor point, pins are draggable, several points per guard | ✅ |
| F3 | One radius scale (field 6 px / card 14 px / pill), fields untinted, focus = accent border + ring | ✅ |
| F4 | The charter orange promoted to a `critical` ROLE with a closed, enforced list of call sites | ✅ |
| F5 | Row alignment, density rebalance, rows that float, sticky stepper + actions, contained and progressive lists | ✅ |
| F6 | Every map big enough to read and work in; the farm detail and the anchor form became editing surfaces | ✅ |
| F7 | A1–A26 re-run, A27–A30 added, 54 captures, ETAT, deploy | ✅ |

### Lot 0.9 in one paragraph

The bug: choosing a farm with no anchor point rendered a mandatory select with
nothing in it and no way to add anything, so the wizard could not be finished and
nothing on screen said why. The fix was not a better message — it was to make the
map the instrument. Step 1 now uses the app's own map-first gabarit, a click
drops an anchor point, a drag moves it, and a guard can carry several because a
group of four routinely covers two positions in a night. That rule generalised to
the whole app: **when a required value is missing, the interface offers the way to
create it on the spot.** Around it, the execution was tightened — fields lost the
green wash and became a hairline on white, five radii became three that the build
enforces, the charter's orange finally appears on screen in the four places where
being loud is the point, lists that used to melt into the page now float above it,
and every map is big enough to be worked in.

### What actually changed, screen by screen (F5.2)

| Screen | Was | Is |
|---|---|---|
| Guard wizard, step 1 | one form column, a 20 rem inert map in a sidebar | map-first: map ~58 % on the physical left, form 42 %, both bounded to the viewport so only the middle scrolls |
| Guard wizard, steps 2–4 | rows on `surface-raised` inside a `surface-raised` card | `<Section bare>` + `.tile` rows that float; the 12-row proposal scrolls inside itself |
| Guard detail | five key/value rows in the 2/3 column, the presence MATRIX squeezed into the 1/3 | dense blocks (roster, presence grid, 24 rem map) take the wide track; facts, driver and timeline take the narrow one |
| Farm detail | 32 rem map in a 3/5 column, anchor points editable only two screens away | map-first at full column height, anchor points beside it, click-to-create and drag-to-move |
| Farm detail, facts | two columns inside a 38 % panel (`sm:` is a VIEWPORT query, not a container one) | one column from `lg`, two again only at `2xl` |
| Anchor form | 14 rem preview + a DISABLED "pick on map" button | the map IS the coordinate field; the numbers are the read-out |
| Import preview | every row of the file rendered straight down the page — a 300-row import put the wizard's own action bar far below the fold | height-capped box, pinned header, 20 rows at a time |
| Guards / incidents / farms lists | a hairline border and no fill — invisible in dark | `.tile-interactive`: card surface, the long Artzenu drop, progressive loading |
| Mission / incident / field maps | 11–13 rem thumbnails | 16–24 rem, and interactive with cooperative gestures so the page still scrolls |

---

## 4b. Lot 0.8 — delivered

| # | Scope | State |
|---|---|---|
| E1 | Charter extracted from the site's real Elementor CSS, logo decoded, both brand fonts parsed; `docs/brand-artzenu.md` + `docs/brand/` reference plates | ✅ |
| E2 | Both palettes rebuilt on the Artzenu gamut; Atlas + Mekomi self-hosted; pill controls; mark on the landing and the rail; day/night map filter re-tuned | ✅ |
| E3 | 122 contrast pairs AA, `/styleguide` re-validated, A1–A24 re-run, 44 captures, deployed | ✅ |

**The document to read before touching colour or type is
[`docs/brand-artzenu.md`](docs/brand-artzenu.md).** It carries the provenance of
every value, the three AA adjustments, and the font-licence question that Lot 1
has to settle.

### Lot 0.8 in one paragraph

The app now looks like Artzenu's own tool. `--text-primary` is the association's
heading green `#0B3D2C`, the accent is its button olive `#6E9558`, `danger` is
its CTA orange `#EF4F28` unmodified, and the surfaces are its pale green wash
`#E9F2EA` diluted into paper. Headings are set in אטלס (Atlas) and everything
else — including every number — in מקומי (Mekomi), both self-hosted from the
association's own files. Dark is derived rather than borrowed: the same hues on
forest-night surfaces in the `#0B3D2C` family, replacing Lot 0.7's navy. No
screen changed structurally.

---

## 4c. Lot 0.7 — delivered

| # | Scope | State |
|---|---|---|
| D1 | Command-centre palette (vivid/ink token pairs), gradients, stagger, `/styleguide` | ✅ |
| D2 | The map is on the PHYSICAL left in both writing directions | ✅ |
| D3 | Dashboard rebuilt as a control room: KPI strip, dominant alerts, agenda widget | ✅ |
| D4 | Agenda screen (week + month), `FarmVisit` object, dashboard widget | ✅ |
| D5 | Guard-staffing wizard, scored proposal, phone round, driver, recap | ✅ |
| D6 | Timelines on incident, mission and farm | ✅ |
| D7 | Rail collapse control on top, single Waze block, counted filters, farm-card rebalance, 390 px sweep | ✅ |
| D8 | Verification, screenshots, deployment | ✅ |

### Acceptance criteria

Four scripts carry them: `bun run accept` (A4–A7, A9, A10, A12, A14, A15,
A20–A23 against `@core`), `bun run contrast` (A13/A19), `bun run dispatch`
(A21), `bun run layout` (A24). The rest are visual and referenced to the
captures in §5.

| # | Criterion | State |
|---|---|---|
| A1 | Zero hardcoded UI strings in `/src/ui` | ✅ grep clean (one Hebrew string survives, inside a code comment) |
| A2 | `/src/core` free of React/DOM | ✅ grep clean — `contrast.ts` and `dispatch.ts` are pure maths |
| A3 | Screens navigable, RTL, at 390 / 1280 px | ✅ screenshots + `bun run layout` |
| A4 | Role isolation enforced in core | ✅ 12 farms / 300 volunteers vs 1 farm / 0 roster |
| A5 | Both anchor message formats | ✅ Waze link vs zero-link kosher text |
| A6 | Nearest-neighbour + Google Maps multi-stop URL | ✅ 10 stops, 10 waypoints |
| A7 | Urgent report → coordinator + farmer, and no one else | ✅ |
| A8 | Volunteers table smooth at 300 rows | ✅ 16 800 px of scroll as ~22 DOM rows |
| A9 | Import wizard flags 2 duplicates + 1 missing phone | ✅ `samples/a9-test-import.csv`, asserted in `accept` |
| A10 | Mismatch visible driver ↔ group ↔ coordinator | ✅ seeded on שמואל וייס, 3 call contacts |
| A11 | Deployed URL works on mobile | ✅ https://azmer-fts.github.io/lo-yanum/ |
| **A25** | **Every colour and type value traces to artzenu.org.il** | ✅ `docs/brand-artzenu.md` §1–§2 — extracted from the site's Elementor kit, not eyeballed |
| **A26** | **The two brand faces are self-hosted and cover the verse** | ✅ 8 woff2 in `public/fonts`; Atlas and Mekomi both cover Tehillim 121:4 including nikkud and shin/sin dots |
| A12 | Theme toggle works, persists, correct per-role defaults | ✅ coordinator→light, field→dark |
| A13 | Contrast table printed, all AA | ✅ `bun run contrast` — 122 pairs on the Artzenu palette, see §8 |
| A14 | Photo capture + import; avatars everywhere | ✅ 149/300 volunteers, 4/6 drivers |
| A15 | Every field-screen number is a working `tel:` link | ✅ all 300 |
| A16 | List ↔ marker hover synchronised both ways | ✅ marker 20→30 px on row hover |
| A17 | Live trace on every tick; both Waze and Maps links valid | ✅ 10 numbered markers + dashed polyline |
| **A18** | **Map physically LEFT on the dashboard + 4 map-first screens** | ✅ captures 1, 2, 11–14 |
| **A19** | **/styleguide shows the new palette with AA ratios printed** | ✅ captures 9, 10 — every ratio computed by `@core/contrast`. Re-validated on the charter; a live theme switch now re-reads the palette (see decision 45) |
| **A20** | **Wizard playable: create → scored list → refusal → promotion → complete → visible** | ✅ 17 browser assertions, see §7 |
| **A21** | **`dispatch.ts` scoring tested by script** | ✅ `bun run dispatch` — 27 checks over distance, equity, pairing |
| **A22** | **Agenda week + month, visit created from an empty slot** | ✅ captures 5, 6 + browser assertion |
| **A23** | **Timelines on incident, mission and farm** | ✅ captures 7, 8, 15 |
| **A24** | **Zero PAGE-LEVEL horizontal scroll on every screen, at every width AND at every splitter ratio; no pinned overlap** | ✅ `bun run layout` — 24 screens × 3 seam positions, `VIEWPORT=all`. **Widened by PO return 5 (2026-08-31)**: the seam is a dimension, and the scroll is measured by really scrolling as well as by `scrollWidth`, because RTL overflow goes LEFT |
| **A79** | **The INSTALLED app clears the system status bar: the gradient is there, and no control rests under the clock** | ✅ `STANDALONE=1 bun run layout` — the whole sweep re-run with `data-standalone` and the real devices' safe-area insets stamped; captures in `docs/screenshots/standalone/` (PO return 7) |
| **A44** | **One template source, three rosters, a link that becomes a pin (G10)** | ✅ `bun run accept` A44 section (36 checks) + `bun run import` (28 checks: download → fill → upload → find) |
| **A64** | **The map is on the physical LEFT on every screen that carries one** | ✅ `bun run mapfirst` — 26 screens audited at iPad landscape; every exemption prints its reason |
| **A65** | **The map/content seam is draggable by finger and by mouse, bounded, persisted, resettable** | ✅ `bun run splitter` — 72 checks over five screens |
| **A66** | **A density pass over every screen, listed one by one** | ✅ the table in §1's P0bis.3 note — what changed, or why the screen was already optimal |
| **A67** | **The generated .xlsx is really RTL, verified by re-opening it** | ✅ `bun run rtl` — 45 checks over the three templates; independently confirmed with openpyxl, which is what caught an invalid `workbookView` attribute |
| **A68** | **Three channels, chosen by phone type and address, with valid prefilled links** | ✅ `bun run outreach` — the hrefs are DECODED and checked, not merely present |
| **A69** | **The group kit's three copied elements are correct** | ✅ same run — international numbers, the coordinator included, kosher phones excluded AND named |
| **A59** | **The threat layer exists, and is coordinator-only (G18)** | ✅ `bun run accept` A59 section (26 checks over all three roles and all three routes) + the map proof captured by hand |
| **A61** | **Three map states per map-first screen, persisted (P0.1)** | ✅ dashboard / farms / farm-detail / route / incidents / missions + both rosters; verified by hand at 1032×1376 and 402×874, captures due at G12 |
| **A62** | **Locality bubbles + tap-filter + נקה on both rosters (P0.2)** | ✅ `bun run accept`, the A62 section (12 checks), plus the tap path in `bun run touch` |
| **A63** | **Every map gesture by finger at iPad portrait (P0.3)** | ✅ `bun run touch` — 32 checks at 1032×1376 with `hasTouch` and no mouse anywhere |

---

## 5. Screenshots — `docs/screenshots/`

Every row exists at both `-mobile` (390 px) and `-desktop` (1280 px) — 34 rows,
68 files.

> Captures are taken against the PRODUCTION BUILD (`bun run build` then
> `bun run preview`), not the dev server. Lot 0.9 lost two full runs to
> `networkidle` timeouts on a loaded machine: the dev server transforms every
> module per request and Vite holds an HMR websocket open for the life of the
> page, so "the network went quiet" is a state this app can legitimately never
> reach. The scripts now wait for the dev toolbar's `<select>` instead, and a
> static server removes the load entirely.

> **`docs/screenshots/standalone/` is a SECOND set and a different question**
> (P3.4, PO return 7). Produced by `STANDALONE=1 bun run layout`, one light and
> one dark per viewport, showing the app as the INSTALLED app with a simulated
> status bar drawn over it. The glyphs in that mock are in the colour iOS will
> actually pick — dark on the light palette, light on the dark one, because the
> system chooses them against `theme-color` and theme.tsx keeps that equal to
> the resolved `--surface-base` — so what the picture answers is the only
> question the assertions cannot: **is the clock readable over the gradient.**
> The page is scrolled before the shot, so there is real content under it.

| # | Screen |
|---|---|
| 1 / 2 | Dashboard, control room — light / dark |
| 3 / 4 | Guard wizard, scored-proposal step — light / dark |
| 5 / 6 | Agenda, week view — light / dark |
| 7 / 8 | Mission detail with the night timeline — light / dark |
| 9 / 10 | `/styleguide`, full page — light / dark |
| 11 | Farms, map-first |
| 12 | Route planner with the live trace |
| 13 | Incidents, map-first |
| 14 | Missions, map-first |
| 15 | Farm card, rebalanced, with its activity timeline |
| 16 | Driver roster |
| 17 | Volunteers table |
| **18** | **Farms map-first — DARK, the re-tuned night tile filter** |
| **19 / 20** | **Volunteer "my guard" — light / dark** |
| **21 / 22** | **Landing: the Artzenu mark, the brand plate, the verse — light / dark** |
| **23 / 24** | **Wizard step 1 — a farm with NO anchor point, and a pin dropped on the map — light / dark** |
| **25** | **Farm detail — DARK, the map-first gabarit** |
| **26 / 27** | **Farm form — the lightened fields — light / dark** |
| **28** | **A61 — the farms map with the map HIDDEN (P0.1)** |
| **29** | **A61 — the same screen with the map FULL** |
| **30** | **A62 — the volunteers roster's locality bubbles, one town tapped** |
| **31** | **A44 — the farms import wizard and its template columns (G10)** |
| **32 / 33** | **A59 — the global map with the threat layer armed — light / dark** |
| **34** | **A55 + A59 — חוות רתם with its hatched threat zone, its vector, and מושב רתמים adjoining** |

> 28–30, 32 and 33 are DRIVEN too, and for the same reason 23/24 are: the
> criterion in each case is a STATE, not a screen. 28 and 29 capture the same
> route twice because the point of A61 is that one screen has three readings —
> a capture of the default proves nothing that 11 does not. 30 taps the largest
> bubble so the frame shows the filter rather than the decoration. 32 and 33
> arm the threat toggle, which is off by default.

> 23 and 24 are DRIVEN captures: the script selects `farm-05`, which has no
> anchor point in the fixtures, then clicks the map. Capturing the route as it
> loads would show the fixture that hid the bug for two lots — the first farm in
> the list happens to have anchor points — rather than the fix.

> 11 and 18 are the same screen in the two themes, and they exist as a pair
> because the day/night tile filter is a token that changed this lot. 21 and 22
> are also a pair on purpose: the brand plate is IDENTICAL in both, and only two
> captures make that visibly a decision rather than an oversight.

> Map screens need ~6 s to settle (WebGL init + OSM tiles + `fitBounds`). The
> capture script waits; screenshotting sooner yields an empty map.

---

## 6. Standing decisions

Lot 0 decisions 1–13, Lot 0.5 decisions 14–20, Lot 0.6 decisions 21–31, Lot 0.7
decisions 32–40 and Lot 0.8 decisions 41–46 all still hold, **except 22 and 23,
which decision 32 generalises; 46, which decision 47 supersedes; and 41–44,
which G17's decision 57 retires** (42's fill-keeps-the-colour/ink-moves
MECHANISM survives — only the charter values it protected are gone). Decisions
32–34 survived two lots unchanged and are why both were cheap. New:

73. **THE WRITE-THROUGH IS DERIVED FROM THE SNAPSHOT, NEVER DECLARED BY THE
    MUTATION (P2.6a).** The obvious design is to have each of the 53 mutations
    say which rows it touched. It is also the one that breaks, and this store
    shows why in its own source. **Mutations FAN OUT:** `createFarmZone` writes
    a zone AND the farm's dunam totals (G15's one writer); `createVolunteer`
    writes a volunteer AND may materialise a driver (G5.2's dual hat);
    `createFarmVisit` writes a visit AND the farm's `nextVisitAt` cache
    (decision 35); `updateDriver` writes a driver AND mirrors four fields back
    onto a volunteer. **And half of them write IN PLACE:**
    `setIncidentResolved` sets a field on an object the array still holds by
    the same reference, as does every `withMission` caller — so an identity
    diff would report NOTHING for them, which is the worst failure available
    here because it is silent and it loses exactly the mutations a night in the
    field produces. So `commit()` takes a structural diff instead: one
    `JSON.stringify` per aggregate, about a thousand short rows, a few
    milliseconds, once per user action. A mutation added in P3 persists
    correctly without its author knowing this file exists. `bun run persist`
    is what keeps the diff structural.

74. **THE BACKEND IS CHOSEN FROM OUTSIDE /src/core, AND THE DEMO ONE IS THE
    DEFAULT (P2.6a).** `store.ts` holds one `StoreBackend` and starts with the
    demo implementation, so `bun run accept`, `bun run dispatch` and all eleven
    browser gates keep driving the fixtures with no configuration and no
    knowledge that P2.6 happened. Real mode calls `installBackend` once, before
    the first render, from `src/data` — the core cannot make that choice
    itself, because `SUPABASE_CONFIGURED` lives in `src/data/config.ts` and the
    import that would let core read it is the import that ends the "core does
    no I/O" invariant. **`persists: false` on the demo backend is not a
    micro-optimisation:** with it false the diff never runs at all, so demo
    mode — /poc included — executes byte-for-byte the code it did before P2.6.

71. **THE OFFLINE MAP IS ONE SELF-HOSTED PMTILES FILE, AND THE OSM PRE-CACHE IS
    ABANDONED FOR GOOD (PO, 2026-08-31 — resolves open question 11).** The
    written order of march asked for a "רענן מפות לא מקוונות" button that
    pre-fetched the Negev's raster tiles. It measured at **4 345 requests per
    device per refresh**, which is a systematic download and is exactly what
    OpenStreetMap's Tile Usage Policy forbids on donated infrastructure. The
    product owner accepted the recommendation instead: **Protomaps PMTiles, one
    file, in a PUBLIC Supabase Storage bucket, read by HTTP range requests, with
    a MapLibre VECTOR style tinted in the app's own colours — both themes.**
    That settles three things in one move: no usage policy to breach and no API
    key; one download instead of four thousand, which is what "offline maps"
    should have meant from the start; and it retires standing carry-in item 2
    (the `hue-rotate` on a raster), open since Lot 0.9. The button becomes
    "download this one file", with a progress indicator and the size shown
    BEFORE the tap — a coordinator on cellular data must be able to decline.
    **Scheduled after P2.6/P2.5b and before P3.4.** The browsing cache that
    P2.5a shipped stays: it costs OSM nothing and it is what covers the ground
    the coordinator looked at before the big file exists.

72. **THE ACCOUNT'S HARDENING IS THREE DASHBOARD SETTINGS, AND ONE OF THEM
    CANNOT BE BOUGHT ON THIS TIER (PO, 2026-08-31).** The product owner set,
    in Supabase's own dashboard: **"Allow new users to sign up" OFF** — phase 1
    has exactly one account and a sign-up form would be a second door on a
    programme whose data is farmers' addresses and volunteers' faces; it is
    reopened deliberately at Lot 4 when farmers and volunteers get logins.
    **Minimum password length raised to 10.** **Leaked-password protection
    switched on.**
    · ⚠️ **THE LEAKED-PASSWORD TOGGLE DID NOT TAKE, AND IT CANNOT ON THE FREE
      TIER.** `get_advisors(security)` still returns `auth_leaked_password
      _protection` as WARN after the change, and Supabase's own documentation
      is explicit: "Leaked password protection is available on the Pro Plan and
      above." So the lint is NOT a forgotten switch and must stop being read as
      one — it is a line item on an upgrade, and the mitigation that is
      actually available is the one already applied: no sign-up, one account,
      a 10-character minimum, and a password only the PO has ever typed.
    · ⚠️ **THE JWT EXPIRY COULD NOT BE VERIFIED FROM HERE, AND THE REASON IS A
      CREDENTIAL BOUNDARY, NOT AN OVERSIGHT.** GoTrue's `jwt_exp` is a
      management-API setting: it lives in neither the database (so
      `execute_sql` cannot see it) nor the anonymous surface, the Supabase MCP
      exposes no auth-configuration tool, and the `supabase` CLI on this
      machine is authenticated to a DIFFERENT organisation
      (`uzrwmkwkulcighotovyb`) which cannot see `lo-yanum-prod`
      (`jkqsqykhquutilldvcsv`). **Read it at Authentication → Sessions → Access
      token (JWT) expiry; the dashboard's ceiling is 604 800 s = 7 days.**
    · ★ **AND THE ANTI-LOCKOUT INSURANCE IS NOT THAT NUMBER — IT IS P2.5b.**
      Worth stating plainly because raising `jwt_exp` looks like it solves the
      problem and does not. The access token is short-lived by design and the
      REFRESH token is what carries a session across days; what actually locks
      a coordinator out of an offline iPad is the client deciding that an
      access token it cannot refresh means "signed out" and throwing away the
      local session. P2.5b's requirement — an expired token no longer discards
      the session, and the client reconnects silently when the network returns
      — is the fix, and it works whether `jwt_exp` is 3 600 or 604 800.

68. **THE APP HAS TWO MODES AND ONE BUILD-TIME SWITCH, AND THE DEMO MODE IS
    THE DEFAULT (P2.3).** `SUPABASE_CONFIGURED` — both environment variables
    present — is the whole of it. Set: the app requires a session and the role
    switcher does not exist. Unset: the app is byte-for-byte what P0bis left,
    on the mock store, with the identity picker. This was not the obvious
    shape; the obvious shape was "auth is on, tests log in". It is the right
    one because **every browser gate in this repository drives the real UI**,
    and the day P2.6 makes the real app start EMPTY, a gate that logs in would
    be asserting things about an empty database. Demo mode keeps `accept`,
    `outreach`, `rtl`, `mapfirst`, `splitter`, `touch`, `wizard`, `import` and
    `layout` testing the app rather than the login. It is also what /poc IS.
    The consequence that has to be respected: **the config file is
    `.env.real`, never `.env`**, because Vite auto-loads `.env` in every mode
    and one such file would flip every gate at once.

69. **THE GATE IS OUTSIDE THE ROUTER, AND SUPABASE ARRIVES IN ITS OWN CHUNK
    (P2.3).** Two decisions that look like implementation detail and are not.
    (a) An unauthenticated visitor to a real build does not get a router at
    all — no route exists to be typed, bookmarked or deep-linked into, so
    there is no exceptions list to keep correct as screens are added. A70
    proves it over eight routes including `/styleguide`. The two older gates
    are untouched: navigation-level `RequireRole`, and the one that actually
    matters, `@core/access` — now mirrored in RLS. (b) `@supabase/supabase-js`
    is behind `import()`. Imported statically it took the initial bundle from
    190 kB to 249 kB gzipped, because it carries postgrest, storage, functions
    and realtime whether a screen uses them or not. Behind a dynamic import
    the entry grew **1.6 kB** and the 58 kB chunk is fetched in parallel in
    real mode and NEVER in demo mode. The app is opened on a farm track at
    02:00 on one bar of signal; that number is not a vanity metric.

70. **THE APP NEVER CREATES AN ACCOUNT AND NEVER SETS A PASSWORD (P2.3).**
    There is no sign-up form, no "forgot password" link, and no invitation
    sent from here — and none of the three is an omission. Phase 1 has ONE
    account; it was created in Supabase's own dashboard by the product owner,
    who is the only person who has ever typed its password. Sending the
    invitation email would have required the `service_role` key, which is
    never fetched, never committed and never reaches the client, so it was
    never on the table. A recovery flow means an email link, an email link
    means parsing a token out of the URL hash, and **the hash is this app's
    router** — which is also why `detectSessionInUrl` is off. When there is a
    second account, that is the moment to build it properly. Two smaller rules
    ride along: a wrong password and an unknown address give the SAME message
    (telling them apart tells an attacker which addresses exist, and A70
    asserts the two strings are equal), and **the account and the ROLE are two
    separate facts** — `app_users` says "a user with no row here is nobody",
    so `20260830000400_coordinator_grant.sql` grants the role by EMAIL lookup
    and RAISES if the account does not exist yet, because an `insert … select`
    over nothing succeeds silently and would leave a coordinator signing in to
    26 empty tables with every gate green.

65. **THE MAP IS ON THE PHYSICAL LEFT ON EVERY SCREEN THAT CARRIES ONE, AND
    ONE SHELL ENFORCES IT (P0bis.1).** Product-owner rule, frozen 2026-08-30.
    Decision 34 said "the map is on the physical left"; it was only ever
    applied to the five screens that happened to use `MapPanel`, and the other
    eight put the map above the content. The same fact in two places depending
    on the route is what makes an app feel like several apps. `MapSplit` is
    now the single implementation — including the two G7 rosters, which needed
    a `page` scroll strategy (sticky MAP, window scroll) rather than an
    exception. The exceptions that remain are printed on every `bun run
    mapfirst`: screens with NO map (the agenda, deliberately — a calendar is
    read like text), and the FIELD shell, whose `max-w-2xl` column IS the
    narrow responsive form the rule allows.

66. **THE SEAM IS A CONTROL, AND THE RATIO IS THE CONTENT'S SHARE (P0bis.2).**
    The three map states answer "do I want geography at all"; the ratio answers
    "how much", and the honest answer changes by screen and by hour. Stored as
    the CONTENT's percentage of the row, 25–75, per screen, in the mode's key
    space. Storing the CONTENT's share rather than the map's is what makes the
    drag ONE formula in both writing directions — the content column is always
    the physical right one, so its width is "the shell's right edge minus the
    pointer". The bounds are load-bearing: past either end a panel becomes a
    stripe, and a splitter that can be dragged into a dead end will be, on a
    moving vehicle. `PanelSplitter` is a component rather than a `MapSplit`
    detail so the guard wizard — map-first but inside its own stepper shell —
    is not the one screen a just-frozen rule skips.

63. **THE THREAT LAYER IS THE ONE SENSITIVE THING, AND ITS GATE IS IN THE DATA
    LAYER (G18).** A farm's boundary is a fact about the ground; "we assess
    this wadi as a high-intensity approach" is an assessment about people. It
    must not reach a farmer's phone, a volunteer's guard card or a driver's
    trip sheet — and the only way to be sure is for the ACCESSOR to return
    nothing, not for a screen to omit a section. `getVisibleThreatZones`,
    `getVisibleThreatVectors` and `getThreatsForFarm` are one rule, in one
    place, tested through all three roles and all three routes (A59). The
    consequence is deliberate: **a farmer is refused the layer for his own
    farm too.** The assessment names patterns across holdings and is the
    programme's to hold; a farmer who wants to know what is around him is told
    by a human, on the phone. These are the first two functions Lot 1
    transcribes into RLS, because they are the two where a wrong policy leaks
    something that matters.

64. **AN OVERLAY IS A TEXTURE, NOT A FIFTH COLOUR (G18).** The map already
    spends four tints on ground (G16); a threat zone drawn in a fifth would
    just be a fifth colour. It is a HATCH with a DASHED outline instead, which
    reads as "laid over the map" before any colour is decoded. Intensity is
    two hues and a WEIGHT — `--status-warn` → `--status-danger`, then a
    double-stripe hatch for `high` — because decision 49 keeps `--critical`
    for four meanings and a threat assessment is none of them. Density also
    survives the two things colour does not: a sun-washed iPad and
    colour-blindness.

60. **THE MAP IS A PANEL THE COORDINATOR SIZES, AND THE CHOICE IS PER SCREEN
    (P0.1).** Three states — מוסתר / מפוצל / מלא — on every map-first screen,
    persisted in `localStorage` under `lo-yanum:map-mode:<screenKey>`.
    `split` remains the default and remains Lot 0.9's exact reading, so no
    screen changes shape until it is asked to. Lot 0.9's collapse control only
    existed below `lg`, which is the one width where a 40 dvh map is not in the
    way; an iPad portrait is 1032 and spent 58 % of the screen on geography
    while the coordinator read contacts. **The hidden panel is
    `display:none`, never unmounted** — a torn-down WebGL context takes the
    camera with it, and a re-created list takes its scroll position and its
    progressive page. The one exception is a WINDOW-virtualised table, which
    must be unmounted instead: `display:none` makes it measure a scrollMargin
    of 0 and come back drawing its rows a page above themselves.

61. **PEOPLE ARE COUNTED BY LOCALITY, NEVER PLACED INDIVIDUALLY (P0.2).**
    The rosters' map is bubbles on towns, sized by area (sqrt, because the eye
    reads a disc by area and a linear radius makes 40 people look like four
    times 10 instead of twice), and a bubble IS a filter that composes with the
    KPI-filters. The programme holds a home town, not a home address, so a dot
    on a street would be both wrong and a privacy claim nobody made — the
    bubble is exactly as precise as the data. A town outside
    `LOCALITY_POSITIONS` is REPORTED next to the switch, never silently
    dropped: same contract as `distanceKm: null` in the dispatch scoring. The
    bubbles are counted from everything EXCEPT the locality filter, or picking
    a town would collapse the map to one bubble with no way back.

62. **A FINGER NEEDS 44 px, AND AN ARMED MAP OWES IT THE WHOLE SURFACE
    (P0.3).** Marker VISUALS keep their 22–34 px; the hit box around them
    grows to 44 (`wrapForTouch`). The consequence is the decision's real half:
    markers stop their click reaching the map (decision 51), so a wider box is
    a wider patch of what LOOKS like empty map and silently is not. While
    `onMapClick` is live the intent is unambiguous — "put the thing HERE" — so
    every marker goes `pointer-events:none`, draggable ones included; ring
    reshaping never runs with placement armed, so no grip loses its grab.
    `bun run touch` drives the whole vocabulary with synthetic touch at
    1032×1376 and asserts the control that matters: a drag STARTING on a
    marker still pans the map.

57. **THE IDENTITY IS NEUTRAL, AND COLOUR IS SPENT ONLY ON MEANING (G17).**
    Product-owner decision, 2026-08-18: the Artzenu charter — colours AND
    typefaces — is retired. The page is barely-tinted grey, cards are white,
    ink is grey-black, dark is the same family on blue-grey, and ONE
    professional blue carries the accent role. Vivid colour survives exactly
    where it means something: statuses, severities, badges, primary buttons,
    markers, zones, the critical role (#EF4F28 stays, now purely semantic).
    Faces: Rubik for body/UI/every number, Frank Ruhl Libre (OFL,
    self-hosted) for display — with Secular One and Heebo self-hosted and
    shown in /styleguide until the PO arbitrates. All the audit MACHINERY of
    Lots 0.7–0.9 (vivid/ink pairs, luminance windows, the three radii, the
    critical allow-list) is untouched: the values changed, the rules did not.

58. **A CARD HAS NO CONTOUR; THE FIELD KEEPS ITS HAIRLINE (G17).** Cards,
    tiles, panels and callouts separate by soft slate shadow plus the
    luminance step to the page — no border. The two survivors are SEMANTIC:
    the 4 px start-bar (card-critical, callouts, the mismatch row) and the
    field's `--border-strong` hairline, which is the field's affordance and
    stays audited at 1.8. `bun run tokens` (A57) fails any card/tile
    className that draws a full `border`, and the empty-state dashes are the
    one allowed exception.

59. **THE SHAPE IS THE BUTTON HIERARCHY (G17).** Major actions — create,
    confirm, save, danger, emergency — are full-colour RECTANGLES at
    `--radius-field`; secondary actions, filters, chips and tags are PILLS;
    call/WhatsApp/SMS are discreet ICON buttons, never a full pill that
    reads as a CTA (ContactActions may not contain a `btn-*` class — gated).
    One glance now separates "this commits something" from everything else.

47. **THE RADIUS SCALE IS THREE VALUES, AND THE BUILD ENFORCES IT.**
    `field` 6 px (inputs, list rows, icon buttons), `card` 14 px (cards,
    sections, modals, map frames), `pill` (CTA buttons, filters, chips). Lot 0.8
    shipped five steps plus the pill and the app used all six, so nothing read
    as a family: a 10 px chip beside a 14 px input inside an 18 px card.
    `tailwind.config.js` now declares `borderRadius` on `theme` rather than
    `theme.extend`, which REPLACES Tailwind's own scale — `rounded-md`,
    `rounded-full` and every arbitrary bracket value fail to compile. This
    supersedes decision 46, whose conclusion (the pill is spent on controls, not
    containers) survives; only the number of steps changed. `bun run tokens`
    checks the raw-CSS half the compiler cannot see.

48. **A FIELD IS A BORDER, NOT A BLOCK OF COLOUR.** Every input sat on the
    charter's green wash; twelve down the farm form turned the page into a stack
    of coloured bars where the required field and the optional one were equally
    loud, and the wash competed with the panels that use the same colour to mean
    something. Fields moved to `--surface-field` — white in light, a plain dark
    well in dark, untinted in both — with one `--border-strong` hairline at rest
    and an accent border plus a 25 % ring on focus. The wash keeps its job as
    `--surface-high` on SECTIONS and informational panels. The consequence is
    audited: the hairline is now load-bearing, so `bun run contrast` pins it at
    1.8 against the field.

49. **THE CHARTER ORANGE IS A ROLE WITH A CLOSED LIST OF CALL SITES.**
    `#EF4F28` was in the token file and never on the screen: it was aliased onto
    `--status-danger`, which the UI only ever renders as a 15 % wash or as its
    darkened ink. `--critical` is that orange promoted to a role, theme-
    independent like the brand plate, and it is allowed in exactly four kinds of
    place — an unresolved urgent incident, an emergency call, the ONE
    irreversible commit in the app ("צור משמרת"), and the two states that mean a
    volunteer is unaccounted for (return not confirmed, driver/group mismatch).
    `bun run tokens` holds a per-file allow-list WITH the reason and checks it in
    both directions, so an entry that stops applying is a failure too. Ordinary
    errors, refusals and delete buttons keep `status-danger`: if everything
    red-ish were orange, the four things above would stop being findable, which
    is the entire value of the colour.

50. **WHEN A REQUIRED VALUE IS MISSING, THE INTERFACE OFFERS THE WAY TO CREATE
    IT.** The generalisation of the F1 bug. An empty `<select>` is the worst
    affordance in the set — it looks like a control that has not loaded, so the
    user waits. `SelectField` therefore takes `emptyAction`, which REPLACES the
    select when there is nothing to choose; `SelectOrCreateField` covers the
    other case, a list that is correct but not closed (the yeshiva field, where
    a free-text box fragments the data into six spellings and a fixed list
    cannot accept the seventh). Every required select in the app now either has
    an enum for options — which cannot be empty — or an escape.

51. **THE MAP IS AN INSTRUMENT, NOT AN ILLUSTRATION.** The map creates anchor
    points and a drag moves one, on the wizard, the farm detail and the anchor
    form, through one shared `AnchorMap`. **Placement is an ARMED MODE** — see
    decision 55, which the product owner asked for after seeing 0.9. Two
    consequences worth knowing before touching `MapCanvas`: a marker's DOM click
    has to `stopPropagation`, or tapping an existing pin drops a second one
    underneath it; and the framing effect had to split in two, because a
    `center`-driven `jumpTo` keyed on the markers snapped the camera back after
    every drag, so the user's own edit undid their pan. Any map still embedded
    in a scrolling page takes `cooperative`, which reserves the one-finger drag
    for the page.

52. **A GUARD CAN COVER MORE THAN ONE POSITION, AND ONE OF THEM IS THE
    RENDEZVOUS.** `Mission.anchorPointId` stays exactly one — it is a logistics
    commitment the driver and every generated message depend on — and
    `additionalAnchorPointIds` carries the rest. Collapsing both into a list was
    the obvious move and the wrong one: "where the driver drops the group" and
    "where the group stands at 01:00" are different facts, and a screen that has
    to guess which element of the array is the first is a screen that will guess
    wrong. **The product owner has since confirmed the rendezvous stays unique,
    and asked for time windows on the others — decision 56.**

53. **NESTED SURFACES ARE THE BUG; ROWS FLOAT.** A list of guards was a `.card`
    whose rows were also `bg-surface-raised`, so the rows were invisible and the
    block read as one slab — worst in dark, where the two surfaces are 1.29
    apart and there is no drop-shadow to lean on. A scannable list now has NO
    card behind it (`<Section bare>`) and each row is itself a small card with
    the long Artzenu drop, so the page shows through between them.

54. **A LIST THAT CAN PASS ~20 ROWS IS CONTAINED AND PROGRESSIVE.** The
    volunteers table has been virtualised since Lot 0 because 300 rows are
    obviously 300 rows; the dangerous lists are the ones that look short in the
    fixtures and are bounded by nothing. They get `.list-scroll` /
    `.table-scroll` (a capped box with a pinned header) and `useProgressive`
    (20 rows, then "show more" with the count). A hook rather than the
    virtualiser because these rows are not a fixed height, and measuring them
    costs more than not rendering the ones nobody has scrolled to. `bun run
    layout` fails any screen past six screenfuls at 390 px.

55. **PLACING A POINT IS AN ARMED MODE, AND ONE PRESS BUYS ONE POINT.**
    Lot 0.9 shipped "any click on the map creates a point", which is what made
    the dead end impossible and also meant a mis-tap while panning left junk
    behind. The product owner's ruling, applied here: a "הוסף נקודה" button arms
    the map, the NEXT click places the pin, and the mode disarms itself
    immediately — so a coordinator who wants two points presses the button
    twice, deliberately, and a coordinator who wants to pan just pans.

    Three signals carry the armed state, because a mode nobody can see is a
    mode nobody can leave: the canvas takes a crosshair cursor, the map gains an
    accent ring, and the banner swaps its instruction for "click the map to
    place the point · Esc to cancel". Escape works, and changing farm disarms —
    an armed mode carried across a farm change would drop the next point on the
    wrong farm. Mechanically the mode IS the `onMapClick` prop: it is passed to
    `MapView` only while armed, which is also where the crosshair comes from, so
    there is no second source of truth to drift.

    `bun run wizard` asserts all four halves — an unarmed click creates nothing,
    the button arms, the next click creates, and a further click adds nothing
    until re-armed. The first of those is the one the product owner actually
    asked for; the others are what stops a fix from becoming a new trap.

56. **EACH ADDITIONAL POSITION MAY CARRY ITS OWN TIME WINDOW — LOT 1.**
    Answered and NOT yet built: the schema is Lot 1's to fix, and inventing a
    shape now in the mock store would be the thing Lot 1 has to undo. The
    decision itself is settled, so build to it:

    · The rendezvous (`anchorPointId`) stays unique and time-less — it is the
      guard's own start, and the driver and the messages already carry it.
    · Every ADDITIONAL position may carry an OPTIONAL window. Empty means the
      whole night, which must stay the default: most guards have no schedule and
      a form that demands two times per position would make the common case
      worse to serve the rare one.
    · This is what settles the `additionalAnchorPointIds` shape flagged in §12:
      an array column cannot hold a per-row window, so it is a JOIN TABLE
      (mission_id, anchor_point_id, position, starts_at NULL, ends_at NULL).

41. **THE PALETTE IS THE ARTZENU CHARTER, AND ITS PROVENANCE IS WRITTEN DOWN.**
    Four tokens (`--brand-forest` `#0B3D2C`, `--brand-olive` `#476E34`,
    `--brand-teal` `#14A185`, `--brand-orange` `#EF4F28`) quote the
    association's declared Elementor globals verbatim; everything else is
    derived from them. `docs/brand-artzenu.md` records where each value was read
    and every place AA forced a change. The rule this replaces is "pick a nice
    palette": the app is the association's tool and has to be recognisable as
    such, so a colour question is now answered by reading the site, not by
    taste. Re-extract with `bun run brand-reference` if artzenu.org.il is
    redesigned.

42. **THE FILL KEEPS THE BRAND COLOUR; THE INK MOVES.** Three charter values
    could not be used unmodified: olive with white text is 3.44:1, the teal is
    too light to be a dot on the pale page, and the orange is far too light to
    be text. In every case the FILL was left alone and the ink was adjusted
    (`--text-on-accent` is now a near-black GREEN, `#06140E`). The one exception
    is `status-success`, where the dot check left no room and `#14A185` had to
    become `#0F8E75` — the charter value survives as `--brand-teal` and returns
    bright in dark. Copying the site's own AA failures was never an option.

43. **TWO BRAND FACES, SPLIT ON A MEASUREMENT.** אטלס (Atlas) sets
    display/title/section/heading; מקומי (Mekomi) sets everything else,
    INCLUDING every number. Not a stylistic preference: Atlas ships proportional
    figures with a 54 % advance spread and NO `tnum` feature, so
    `font-variant-numeric: tabular-nums` is inert in it — measured at 22.41 px
    of spread at 100 px in the browser, against 0.00 px for Mekomi. This app is
    a column of numbers. Both faces are Artzenu's, so the split stays inside the
    charter; Rubik is demoted to fallback and kept only for that.

44. **THE BRAND PLATE IS THE SAME IN BOTH THEMES.** `--gradient-brand` is the
    site's own hero wash (olive → forest, 158°) and does not have a night
    variant, because a brand does not. Its ink therefore cannot come from
    `--text-primary`, so there is exactly one theme-independent ink token,
    `--text-on-brand`, and the audit pins it against the gradient's LIGHTEST
    stop — otherwise "brighten the plate a little" silently takes Tehillim 121:4
    below AA.

45. **THE STYLEGUIDE READS THE PALETTE ONE FRAME LATE, ON PURPOSE.** React
    flushes effects child-first, so the screen's `getComputedStyle` used to run
    BEFORE the provider above it restamped `data-theme` — printing one theme's
    hexes next to the other theme's colours. A reload happened to win the race,
    which is why it survived Lot 0.7's captures and only appeared when a
    reviewer switched theme in the page. The `requestAnimationFrame` in
    `usePalette` is the fix and is load-bearing.

46. **THE PILL IS SPENT ON CONTROLS, NOT CONTAINERS.** The charter is a 30 px
    pill language on buttons AND inputs. Buttons take it literally; `.input`
    deliberately stays at `--radius-md`, because a pill spends ~15 px of its own
    start padding and a twelve-field form of pills gives the eye no left edge to
    run down. Cards and tables stay boxes for the same reason.

32. **EVERY semantic hue is a PAIR: `--x` (vivid) and `--x-ink` (text).**
    The vivid token is the FILL — dot, marker, severity bar, gradient stop.
    The ink token is the same identity darkened (in light) or lightened (in
    dark) until it is legible as TEXT on that colour's own 15 % wash. Lot 0.6
    had one token doing both jobs, and "legible as 11px text on paper" is the
    constraint that dragged the whole palette toward mud — which is exactly
    what the product owner saw as "dated". A chip is therefore always
    `bg-x/15 text-x-ink`; using the vivid as text is the one mistake the split
    exists to prevent. Decision 22 (`accent`/`accent-ink`) is this rule's
    first instance.

33. **A light vivid lives in a NARROW luminance window, and the audit pins it
    there.** It must be dark enough to clear 3:1 against the page (it is a dot)
    *and* light enough for near-black `--text-on-accent` to clear 4.5:1 on top
    of it (it is also a solid fill carrying a route-step number). `bun run
    contrast` checks both ends for all twelve hues. Slate, fuchsia and violet
    failed the second check at Lot 0.6 levels; raising them is what let the
    light palette be saturated instead of inky.

34. **The map is on the PHYSICAL left, in every writing direction.** The one
    deliberate exception to "everything is logical and flippable": geography
    left, content right. It needs both direction variants, because the same
    `flex-direction` produces opposite physical results per writing mode —
    RTL + `row` and LTR + `row-reverse` both put the map on the left with a
    list-then-map DOM order. The divider is a PHYSICAL `border-r` for the same
    reason. The agenda grid is the counter-example and is NOT flipped: a
    calendar is read like text, so RTL's natural first-cell-on-the-right is
    correct there.

35. **`Farm.nextVisitAt` is a DERIVED CACHE of `FarmVisit` rows.** One writer:
    `syncNextVisit` in store.ts, called after every visit mutation. The field
    predates the agenda and is read by the route planner, the dashboard and
    the farm card; deriving it rather than maintaining it in parallel is what
    stops "the agenda says Tuesday" and "the farm card says Tuesday" from
    disagreeing.

36. **The dispatch ranking is a PROPOSAL and shows its reasoning.** Score =
    100 − 0.45/km − 1.2/guard-served + 12 for a shared yeshiva, with
    availability applied as a FILTER before scoring (an unavailable person must
    not merely rank low). Deterministic, ties break on id. The UI prints the
    three components as chips: a coordinator who cannot see why a name is first
    will not trust the list and will go back to their notebook.

37. **A refusal promotes, it does not delete.** The shortlist is longer than
    the requirement (`shortlistSize`), and marking someone as declined drops
    them, adds them to the exclusion set, and pulls the next-best candidate
    into the freed slot in the same action. The gauge counts CONFIRMED people
    only.

38. **`pickedUpAt` and `completedAt` are different facts.** The first is the
    driver saying he has everyone; the second is that claim reconciling with
    the group holder's, with no mismatch. The gap between them is the failure
    the whole programme exists to catch, so the mission timeline shows both
    steps even though they usually coincide.

39. **`--shell-bottom` is MEASURED, not declared.** The demo toolbar publishes
    its own height through a `ResizeObserver`; every sticky footer and every
    full-height map column offsets by it. A hard-coded 2.75 rem was 5 px short
    at 390 px, where the bar wraps — which is exactly the width where the
    overlap matters. Lot 1 deletes the toolbar and the variable falls back to
    its token default.

40. **Timelines print "—", they do not hide unreached steps.** An empty slot in
    a sequence is information ("nobody has confirmed the pick-up"); collapsing
    it destroys that. The first unreached step is marked `current` and gets the
    accent ring, so "what are we waiting on" is answerable without reading.

---

## 7. Verification scripts

All twelve are committed and runnable.

- **`scripts/contrast.ts`** (`bun run contrast`) — the A13/A19 audit. Parses
  `tokens.css`, reconstructs both palettes, and checks text, chips (ink over
  the vivid's own 15 % tint), dots, solid fills and elevation steps. The maths
  lives in `@core/contrast`, which the `/styleguide` screen also imports — so
  the ratios shown in the browser are the ratios this gate enforces.
- **`scripts/dispatch.ts`** (`bun run dispatch`) — A21. Hand-built fixtures,
  one case per scoring rule, plus determinism and the refusal-promotes case.
- **`scripts/accept.ts`** (`bun run accept`) — A4–A23 through `@core`.
  Promoted from a scratchpad file this lot. Driving the business layer is the
  point: a browser test cannot distinguish "the screen does not show it" from
  "the session cannot read it".
- **`scripts/brand-reference.ts`** (`bun run brand-reference`) — the reference
  plates behind `docs/brand-artzenu.md`. Needs the internet, not a dev server.
  The palette itself comes from the site's CSS, but a written charter no human
  can check is not a charter; these are the pictures the claims are checked
  against. Writes JPEG on purpose — a full-page PNG of a site built on landscape
  photography is ~5 MB of repo for no gain.
- **`scripts/persist.ts`** (`bun run persist`) — A73, 84 checks, P2.6a's gate.
  It exists to protect ONE decision: that the write-through learns what to
  write by taking a STRUCTURAL diff of the snapshot, never from 53 hand-written
  declarations (decision 73). The day that diff is "optimised" into a reference
  comparison, every mutation that writes in place — `setIncidentResolved`,
  every `withMission` caller, `archiveVolunteer`, `setCommitmentFulfilled` —
  starts persisting nothing, silently, and surfaces a week later as a night of
  presence marks that never left the iPad. Section 7 of the script is the other
  half: it re-reads `src/core/index.ts` and fails if a mutation was exported
  without a line in the gate, so the coverage cannot rot.
- **`scripts/mapping.ts`** (`bun run mapping`) — A74, 32 checks, P2.6b's gate.
  `src/data/rows.ts` is 26 hand-written column lists, which is exactly the kind
  of code that is 98 % right and whose missing 2 % is a farmer's phone number
  that silently stops arriving. Section 2 round-trips every aggregate in the
  fixtures; section 5 reads the migrations. **Section 5 is the one that earns
  its keep**: it would have found P0bis.5a's `email` and P0bis.5b's `event` on
  its own, without anyone thinking to look, because a round trip never touches
  a database and cannot know the schema is behind. The single family of
  differences it tolerates is listed at the top of the file — three optional
  `Farm` fields that are `not null` in the schema — and nothing else.
- **`scripts/sync.ts`** (`bun run sync`) — A77, 28 checks. Every rule the
  offline layer makes to a coordinator on a farm track at 02:00, asserted
  rather than argued for in a comment nobody re-reads. It drives the real
  functions against `memoryCache()`, which satisfies the same `CacheStore`
  contract IndexedDB does — so what a browser is left to prove is only that
  IndexedDB works, which is one assertion rather than twenty. The check worth
  knowing about: **a failed flush keeps everything**, because an entry is
  removed only once the server has actually taken it.
- **`scripts/write.ts`** (`bun run write`) + **`scripts/fixture.ts`** — A76, 38
  checks, and the one claim P2.6 could not make on its own. A73 proves every
  mutation reports the right aggregates, A74 that the mapper is lossless in
  memory, A75 that the live schema accepts every column — **none of them proves
  the sentence a coordinator cares about: "I changed something and it is still
  there."** This does, against Frankfurt, driving `applyChanges` and
  `hydrateFrom` themselves rather than a re-implementation of them (which is
  why `src/data/write.ts` takes a client as an argument instead of reaching for
  the app's).
  `fixture.ts` is a whole programme in miniature — one instance of every shape
  that has its own table, column or ordering rule: the driver/group
  DISAGREEMENT that R6 must not merge, two cars with their own passenger lists,
  an extra position kept separate from the rendezvous, three outreach events
  with one un-sent, three commitments whose ORDER an index addresses, an
  incident log whose ids do not sort chronologically, a threat vector attached
  to nothing. **Every id begins `a76-`**, which is what makes the cleanup a
  statement rather than a hope — and is why it does not reuse the demo
  fixtures, whose ids are exactly the ones a real import would use.
- **`scripts/live.ts`** (`bun run live`) — A75, 46 checks, and the answer to
  "the repository says the column exists; does Frankfurt?". A74 reads the
  migration FILES, which say what was WRITTEN, not what was APPLIED — a
  migration that failed halfway or a branch never merged leaves the repo
  agreeing with itself while the deployment disagrees, and the first thing to
  notice is a coordinator whose edit vanished. This asks the deployment,
  anonymously, using the one property that makes it possible: **PostgREST
  parses `?select=` against the schema before RLS runs.** A missing column
  comes back 400 with its own name; an existing one comes back `[]`, the rows
  being what RLS refuses. Nothing crosses the wire that is not already public
  in these migrations. The `[]` assertion grows teeth the day P3 imports real
  data: today it is what an empty table returns anyway, from the first
  imported farm it is RLS working and a row would be the leak.
- **`scripts/samples.ts`** — not a gate; the column list A74 and A75 both ask
  their different answerers about. It exists because reading only the FIRST
  aggregate of each collection is the obvious version and hides in a specific
  way: an aggregate whose child list is empty writes no row, so that child's
  table is never probed. `cancel_notices` was exactly that — no fixture guard
  carries an outreach tick, because a tick is something a coordinator does —
  and it was also the table P2.6's catch-up had to change. **The one table
  nobody could see was the one that was wrong.**
- **`scripts/tokens.ts`** (`bun run tokens`) — A28 + A29. A static gate over
  `src/`, and the only one that needs neither a browser nor a running app. Both
  rules it enforces are rules about RESTRAINT, which is what a codebase loses
  quietly: nobody adds a fifth radius or a second orange on purpose, they add one
  because the component in front of them needed it and the rule lived in a
  document. Strips comments before matching, so the prose describing a rule is
  not read as a violation of it.
- **`scripts/auth.ts`** (`bun run auth`) — A70, 20 checks, P2.3's gate. The
  only script that starts its own servers: one per mode, on 5199 and 5198, so
  the two are compared inside a single run. **It never needs the password**,
  and that constraint shaped it — the account's password belongs to the
  product owner and must not reach this repository, this script or an agent.
  What is left to assert without one turns out to be most of what matters:
  that a stranger gets the login form on all eight routes tried and nothing
  else, that a refusal says so in Hebrew and leaves no token in storage, that
  a wrong password and an unknown address produce the SAME string, that demo
  mode still hands out the role switcher every other gate depends on, and —
  with no browser at all — B1: 26 tables anonymously closed, an anonymous
  INSERT that would grant itself `coordinator` refused with 42501, and the
  three policy helpers 404 rather than reachable. One trap is written into the
  script: an unknown table name returns 404 from PostgREST, which the first
  version read as "refused" — so a misspelling PASSED. A 404 is now a
  FAILURE, and the table list is the full 26 rather than the ones remembered.
- **`scripts/offline.ts`** (`bun run offline`) — A72, 11 checks, P2.5a's gate.
  The only script that BUILDS: the worker is `import.meta.env.PROD`-only, so a
  dev server would prove nothing and a stale `dist/` would prove something
  about last week. It builds twice — a demo build and a real one — and serves
  each with `vite preview`. **The check the file exists for is a check about
  NOT caching:** offline, a request to the Supabase origin must FAIL. A cached
  REST answer is a stale fact about tonight and a cached auth response is
  somebody else's session on a shared iPad; the only correct offline story for
  data is P2.5b's outbox, which knows about identity and last-write-wins, and a
  service worker knows about neither. Two traps are written into it: the
  offline badge is asserted VISIBLE and not merely PRESENT (both shells render
  one, CSS hides the wrong one, and counting DOM nodes would have asserted
  `=== 1` against a truthful `2` — which is how a gate ends up being "fixed" by
  breaking the app); and /poc must come back as ITSELF offline, which is the
  navigation fallback's one hard case.
- **`scripts/storage.ts`** (`bun run storage`) — A71, 10 checks, P2.4's gate.
  It is short because most of what it wanted to assert turned out to be
  unprovable without a password, and saying so was better than dressing it up.
  Both buckets are EMPTY, so on almost every endpoint "refused" and "there is
  nothing there" are the same answer — the exact trap P2.2's migration comment
  records. **One endpoint escapes it, and the gate is built on that one:** a
  PUBLIC bucket answers a missing object with `NoSuchKey`, a PRIVATE one with
  `NoSuchBucket`, because for an anonymous caller the public route does not
  exist at all. That answer does not depend on the contents. Around it: no
  bucket or object enumeration, no signed URL minted for a stranger (a leak
  would show as a `token=` in the response), no anonymous upload — refused with
  "new row violates row-level security policy". **What it CANNOT prove, printed
  in every run:** that a farmer reaches his own agreement and not his
  neighbour's, and that a volunteer reaches the group he is standing with.
  Both need a signed-in caller.
- **`scripts/wizard.ts`** (`bun run wizard`) — A27, 28 checks. Plays the guard
  wizard from a farm with NO anchor point: the callout instead of a dead select,
  the armed-mode placement in all four of its halves (decision 55), the rename
  that reaches the pin's label, the drag, the scored proposal, the refusal-promotes case, the gauge, the orange
  commit button and the recap that names the point drawn in step 1. This is the
  test A20 should have been: A20 passed throughout the bug's life because the
  fixtures list a farm WITH anchor points first.
- **`scripts/layout.ts`** (`bun run layout`) — A24 + A30. Walks all 22 screens at
  390 px and asserts no horizontal overflow, no element wider than the
  viewport, and no two pinned elements overlapping. It caught two real bugs:
  the sticky form footer sitting under the demo toolbar, and a `min-width:auto`
  grid item letting the presence table push the page 40 px wide. Lot 0.8 caught a
  THIRD: Mekomi is a wider face than Rubik, and that alone was enough for the
  farm-card grid's `min-width: auto` tracks to push the page to 397 px. Both
  tracks now carry `min-w-0`. This is the script that pays for itself every lot —
  a 7 px overflow is invisible in a screenshot. Lot 0.9 added the VERTICAL half
  (A30): page height as a multiple of the viewport, capped at six, plus a walk up
  from every table and every 20-plus-row list looking for an ancestor that
  genuinely scrolls — `overflow-y:auto` AND a content height greater than its own
  box, because a container with `auto` and no height limit does not scroll, it
  grows, and would otherwise satisfy a naive check while the page still
  stretched. `/styleguide` carries the single exemption, printed in the run.
  **The product owner's return of 2026-08-31 added the two dimensions it was
  missing, and both immediately found something.** The SEAM: the sweep now
  measures each screen at three positions of the map/content splitter, reached
  by focusing the real `role="separator"` and pressing `End` / `Home` — one page
  load, three ratios, and the ratio the app applies rather than a number seeded
  into `localStorage`. Screens with no seam at that width print `no seam` rather
  than silently collapsing the dimension. And the INSTALLED APP: `STANDALONE=1`
  re-runs everything with `data-standalone` and the real devices' safe-area
  insets stamped on `<html>` — which is possible only because `tokens.css` reads
  `env(safe-area-inset-*)` once into `--status-inset` / `--safe-bottom` and every
  rule in the app reads those. It found `CreateGuardFab` sitting ON the demo bar
  once that bar took the home-indicator inset, and — the one nobody would have
  found by looking — `PanelSplitter` and MapLibre's zoom buttons in the top
  24 px of every map screen. See §12bis.5 and §12bis.7.

A20's interactive half is now committed as `scripts/wizard.ts` rather than
recreated from notes each lot — it was a throw-away script for two lots and that
is precisely how the F1 dead end survived them.

A trap that cost time while writing it: reading candidate names from every `<li>`
on the page also picks up the STICKY STEPPER, whose steps are list items with a
semibold label. "A refusal removed מה ומתי" was a green-looking assertion about
nothing. The selector is scoped to `li[class*="tile"]`, the rows themselves.

Note when writing such probes: React delegates `onMouseEnter` through a
**bubbling `mouseover`**, so a raw non-bubbling `mouseenter` will not trigger
it; map markers use a plain `addEventListener` and do respond to the native
event.

---

## 8. Contrast audit (A13/A19)

`bun run contrast` — **70 pairs on the G17 neutral palette, all meet WCAG AA.**
Rewritten at G12: §8 had carried the pre-G17 Artzenu numbers since Lot 0.8, so
every value below was stale by two identity changes. The MACHINERY did not
change — the vivid/ink split (decision 32), the luminance window (33), the
field hairline pinned at 1.8 (48) — only the values it now measures.

Tightest margins, ordered by how close the worse theme sits to its threshold:

| Pair | Light | Dark | Min |
|---|---|---|---|
| `surface-field` vs `surface-raised` (field in a card) | 1.00 | 1.24 | 1.0 / 1.2 |
| `text-on-accent` on solid `status-violet` / `farm-signed` | 4.56 | 7.64 | 4.5 |
| `text-on-accent` on solid `status-info` / `farm-verbal-ok` | 4.57 | 8.11 | 4.5 |
| `text-on-accent` on solid `status-success` / `farm-active` | 4.59 | 8.96 | 4.5 |
| `border-subtle` on `surface-base` | 1.24 | 1.64 | 1.2 |
| `surface-raised` vs `surface-base` (elevation) | 1.10 | 1.27 | 1.05 / 1.25 |
| `text-on-accent` on `accent-dim` | 4.74 | 6.13 | 4.5 |
| `text-muted` on `surface-high` | 5.01 | 4.75 | 4.5 |
| `status-warn` / `farm-contacted` dot on the page | 3.17 | 9.18 | 3 |
| `text-on-accent` on solid `farm-visited` | 4.81 | 7.03 | 4.5 |
| `surface-high` vs `surface-raised` (hover row) | 1.13 | 1.22 | 1.04 |
| `farm-verbal-ok` chip (ink on 15 % tint) | 6.11 | 4.89 | 4.5 |
| `border-strong` on `surface-field` (the field edge) | 1.97 | 3.15 | 1.8 |
| `critical` marker on `surface-base` | 3.28 | 5.25 | 3 |

The two ends of the window decision 33 describes are still what binds the light
palette, and they are still within ~2 % of their thresholds: a dot has to be
dark enough to be seen on the page (3.17) while the same hue has to be light
enough to be written on (4.56). That is the point — the palette is as saturated
as AA allows. The charter's orange `#EF4F28` survives G17 as `--critical` and
still fits inside that window unmodified, which is why decision 49's role could
be kept when the rest of the charter was retired.

Elevation is held to a stricter threshold in dark: a drop-shadow is invisible
on near-black, so the card separates from the page by luminance alone (1.27
against a 1.25 floor). The same reasoning governs the field: with the tinted
background gone (decision 48), `--border-strong` is the ONLY thing that says
"you can type here", so it is audited at 1.8 rather than at the 1.2 a
decorative edge gets — and in dark the field additionally has to sit a
measurable step below the card containing it.

G18 added no pair: the threat layer spends `--status-warn` and
`--status-danger`, both already audited as fills, dots and chips.

---

## 8b. Field documentation — `docs/terrain.md`

**Written for the product owner and the coordinator, not for developers**, and
kept out of this file on purpose: `ETAT.md` is the memory of HOW the thing is
built, and a coordinator standing in a farmyard needs neither. It carries the
two addresses and what each is for, the first-connection procedure with the
five things to check the very first time, a numbered field check-list PER
DEVICE (the coordinator's iPad, his phone, a fixed workstation — and the
explicit "nothing to do" for farmers, volunteers and drivers, who have no
account in phase 1), the iPad PWA installation in nine steps, and a two-column
table of what does and does not work with no network.

Two things in it are worth knowing about even from here, because they are
counter-intuitive and a coordinator will meet both:
· **Installing the PWA and then signing in IN SAFARI does not sign you in.**
  The installed app has its own storage. Sign in from the icon.
· **Do not sign out before going into the field.** Signing out deliberately
  wipes the cache and any pending writes — that is what protects a shared
  iPad, and it is exactly the wrong reflex before driving into the Negev.

---

## 9. Source of truth

```
docs/brand-artzenu.md     ★ THE CHARTER. Provenance of every colour and font
                            value, the three AA adjustments, the licence
                            question. READ BEFORE touching colour or type.
docs/brand/               Reference plates from the live site (bun run brand-reference)

src/styles/tokens.css     ★ BOTH PALETTES. The four --brand-* tokens quote the
                            charter verbatim; the rest is derived. Vivid/ink
                            pairs, --critical (the orange as a ROLE),
                            --surface-field, THE THREE-VALUE RADIUS SCALE,
                            gradients, motion, type. No hex anywhere else.
public/fonts/             5 self-hosted OFL woff2 — Rubik ×3 (body, every
                            number) + Frank Ruhl Libre ×2 (display, the PO's
                            final arbitrage of 2026-08-30). No CDN: a farm
                            track at 02:00 has no coverage.

src/core/                 PURE TS — no React, no DOM
  types.ts                Domain types, LegConfirmation, FarmVisit, AgendaEvent.
                          Mission.anchorPointId is THE RENDEZVOUS;
                          additionalAnchorPointIds are the night's other posts.
  access.ts               ★ THE ROLE GATE. Every screen reads through it.
  store.ts                Observable store + mutations. `_raw()` is access.ts-only.
                          patchAnchorPoint (a drag knows a position, not a draft)
                          and deleteAnchorPoint (refuses if a guard still points
                          at it, and SAYS SO).
  dispatch.ts             ★ GUARD SCORING (D5). Pure, deterministic, tested.
  contrast.ts             WCAG maths, shared by the audit script and /styleguide
  clock.ts                Time + calendar arithmetic (DST-safe, Sunday-first)
  geo.ts                  Haversine, LOCALITY_POSITIONS gazetteer, bounds,
                          ringAreaDunams/ringCenter (G15),
                          clusterByLocality/bubbleDiameter (P0.2)
  theme.ts                Theme POLICY (defaults per role). No storage.
  xlsx.ts                 ★ P0bis.4 — the .xlsx WRITER. Pure: OOXML parts +
                          a stored-entry ZIP. Real RTL (sheet view AND
                          readingOrder per cell), frozen header, widths,
                          five styles. SheetJS reads uploads; it does not
                          write the template.
  templates.ts            ★ G10 — THE IMPORT COLUMNS, one source of truth.
                          Three templates (volunteers/farms/drivers); the
                          .xlsx, the header guess, the mapping options and
                          the required set are all derived from it.
  import.ts               Validation only (columns live next door). Problems
                          REJECT; warnings (מיקום חסר) do not.
  outreach.ts             ★ P0bis.5 — the sending centre's brain. Channel per
                          phone type, one message writer for the three
                          events, the WhatsApp group kit. Pure.
  photo.ts routing.ts messages.ts config.ts sessions.ts
  mock/                   threats.ts (G18 — 2 zones + 2 vectors, one of each
                          attached and one free) ·
                          farms(12) · people(300 volunteers, 6 drivers) ·
                          generate.ts (seeded PRNG) · anchors(4) · missions(6,
                          one seeded mismatch) · incidents(5) · visits.ts

src/data/                 ★ P2.3 — THE BACKEND LAYER. Neither pure-TS core nor
                            React UI, so it is neither.
  config.ts               SUPABASE_CONFIGURED / URL / key. IMPORTS NOTHING —
                          the mode is needed in the first frame, and this
                          module must never drag supabase-js onto that path.
  client.ts               getSupabase(), memoised, behind a DYNAMIC import
                          (decision 69b). Never fetched in demo mode.
  auth.ts                 The session as the app sees it: a subscribe/snapshot
                          pair shaped like @core/store's, no React. signIn /
                          signOut. NO signUp, and there is not meant to be one.
  storage.ts              ★ P2.4 — the key builders (photoKey/agreementKey, the
                          shape the storage policies read) and BATCHED signed
                          URLs with a TTL cache. 300 portraits is one round
                          trip, not 300. Cleared on sign-out: a signed URL
                          outlives the session that minted it.

src/locales/he.json       ★ ALL UI COPY. en/fr intentionally {}.

public/sw.js              ★ P2.5a — THE SERVICE WORKER. Hand-written, no
                            Workbox: navigations network-first (a deploy must
                            be picked up), hashed assets and fonts cache-first,
                            map tiles cache-first as a BROWSING cache, and
                            NOTHING from Supabase, ever.
src/ui/offline.ts         ★ P2.5a — registration (PROD only, which is what
                            keeps the other gates honest), useOnline,
                            useOfflineMaps.

src/index.css             ★ @font-face for both brand faces; the brand face bound
                            to the type SCALE (unlayered, after utilities, on
                            purpose); .btn/.input/.check/.artzenu-mark;
                            .tile + .tile-interactive (F5.3, rows that float);
                            .list-scroll + .table-scroll (F5.5);
                            .btn-critical/.chip-critical/.card-critical (F4)
src/ui/
  theme.tsx               Theme APPLICATION: localStorage + data-theme + matchMedia.
                          The theme-color meta READS --surface-base rather than
                          restating it (Lot 0.8 found two stale literals there).
  hooks/                  useCore · useLocale ·
                          useShellMetrics (publishes --shell-top / --shell-bottom,
                          decision 39) · useProgressive (F5.5)
  components/             MapSplit ★ (P0bis.1 — THE map-first shell: map on the
                          physical left, three modes, two scroll strategies,
                          the draggable seam. Every screen with a map uses it,
                          MapPanel included) ·
                          splitter.tsx (P0bis.2 — PanelSplitter, mouse+finger,
                          also used by the wizard's own step-1 shell) ·
                          threats.tsx + ThreatPanel (G18 — the coordinator-only
                          layer's vocabulary and its editable list) ·
                          mapMode ★ (P0.1 — the three map states, per screen;
                          P0bis.2 — useMapRatio, the persisted seam ratio) ·
                          PeopleMap (P0.2 — the rosters' locality bubbles;
                          P0bis.1 — now just the map, inside MapSplit) ·
                          AnchorMap ★ (F2 — the map that CREATES anchor points,
                          shared by the wizard, the farm detail and the form) ·
                          MapPanel (the map-first LIST shell — markers, legend, overlay,
                          selected-marker card — over MapSplit) · MapCanvas/MapView (lazy) ·
                          Timeline (D6) · FarmVisitModal (D4) · CreateGuardFab (D3.4) ·
                          Avatar · PhotoField · PresenceRoster · ThemeToggle ·
                          badges (vivid/ink) · primitives · fields · layouts ·
                          ContactActions
  screens/LoginScreen.tsx        ★ P2.3 — the real front door + AuthSplash.
                          Only ever rendered in a real build; the landing
                          screen's identity picker stays with the POC.
  hooks/useAuth.ts        useSyncExternalStore over src/data/auth
  screens/StyleguideScreen.tsx   ★ /styleguide (D1), hidden route
  screens/coordinator/    Dashboard(control room) · Agenda(D4) · MissionWizard(D5) ·
                          FarmsList · FarmDetail · FarmForm · AnchorSheet ·
                          AnchorForm · RoutePlanner · Volunteers ·
                          VolunteerFormModal · ImportWizard · Missions ·
                          MissionDetail · Incidents · IncidentDetail
  screens/farmer|volunteer|driver/
```

---

## 10. Known limitations (not regressions)

- **State is in memory only, IN BOTH MODES.** A reload resets everything,
  including photos, created guards and planned visits.
- ⚠️ **A SIGNED-IN COORDINATOR STILL SEES THE MOCK DATA.** P2.3 put a real door
  on the building; it did not change what is inside. The 12 farms, the 300
  volunteers and the 6 guards behind the login are the same fixtures the POC
  shows, and nothing typed there reaches Supabase — the database is
  deliberately EMPTY. **P2.6 is the unit that swaps the store**, and until it
  lands, do not read anything behind the login as real. This is the single
  most misleading state the project will pass through, which is why it is
  written here rather than left to be inferred.
- **The wizard sends nothing.** Messages are generated and copyable; responses
  are typed in by the coordinator. That is the Lot 5 boundary.
- **Placeholder portraits are synthetic SVGs**, deliberately obviously so.
- **Route polyline is straight segments**, not road geometry — there is no
  routing service. It exists to make the ORDER legible, not to navigate by.
- **`LOCALITY_POSITIONS` covers the 20 towns the fixtures use.** A locality
  outside it is charged a flat 80 km rather than scoring zero, and reports
  `distanceKm: null` so the UI shows "—" instead of a fabricated number.
- **The agenda has no drag-and-drop.** Events are opened and edited, not moved.
- **An anchor point created from the wizard has an EMPTY access description.**
  Deliberate — a coordinator on the phone should not have to compose driving
  directions before staffing a night — and the debt is surfaced twice: a warning
  on the wizard's recap and a placeholder in the farm-detail list. It matters
  because that text is the only thing a kosher-phone volunteer ever sees.
- **`deleteAnchorPoint` refuses when a guard still points at the anchor.** It
  returns `false` and the wizard shows why. Reassigning the guard first is a
  Lot 1 flow; deleting anyway would make the mission invisible, since
  `toMissionView` returns null when its anchor cannot be resolved.
- **Two chunks exceed Vite's 500 kB warning** (MapLibre ~818 kB, SheetJS
  ~500 kB). Both are split and lazily fetched. **The initial bundle is 192 kB
  gzipped** — the "~146 kB" carried here through several lots was stale: the
  frozen P0bis build measures 190 kB, so P2.3 added 1.6 kB, not 46. Supabase
  is a third split chunk (58 kB gzipped), fetched only in a real build.
- **The buckets exist and are closed, but nothing writes to them yet.** P2.4
  built the doors and the signing helper; the camera capture and the agreement
  PDF are P3, and the components still read `photo` straight through. So the
  buckets are EMPTY, which is also why A71 can only prove the anonymous half.
- **The offline shell needs ONE online load first.** The worker caches what it
  sees rather than a build-time precache manifest, so a device that has never
  opened the app online has nothing to fall back on. After one load it is
  fully offline-capable, /poc included.
- ⚠️ **AN EXPIRED TOKEN OFFLINE LOCKS THE COORDINATOR OUT.** Supabase's default
  access token lives one hour; refreshing it needs the network. A coordinator
  who has been offline longer than that is signed out and cannot sign back in
  until he has signal. The mitigation is a dashboard setting (a longer JWT
  expiry) plus P2.5b holding the session rather than discarding it on a failed
  refresh. Written here because it is exactly the failure that will happen in
  the field first, and it is invisible from a desk.
- **A real build has ONE account and no way to make another.** No sign-up, no
  password reset, no invitation. Deliberate — see decision 70 — and the thing
  to build first when a second person needs a login.
- **OSM raster tiles** — must move to a keyed vector provider in Lot 1.
- **`scripts/` is outside tsconfig's `include`.** `bun run typecheck` covers
  `src` and `vite.config.ts` only, so a changed @core signature can leave a
  verification script silently wrong rather than failing to compile. G10 hit
  this: `analyseImport` gained an options object and A9 went on passing an
  array, losing two checks without a type error. Always run `bun run accept`
  after touching a core signature. Widening the include is Lot 1 work — the
  browser scripts' `page.evaluate` bodies need DOM lib settings that would
  otherwise leak into the app's own compile.
- **A shortened map link cannot be resolved client-side.** `maps.app.goo.gl`
  and `waze.com/ul/h…` carry no coordinates; the position is behind a redirect
  the target domain does not CORS-allow. The import flags them rather than
  guessing. Resolving them server-side is a Lot 1 possibility, not a bug.

---

## 11. Open questions

1. When driver and group holder disagree, who should be called first? The
   dashboard currently offers volunteer, driver and group holder as equals.
2. Should a mismatch **block** a mission from completing until a human resolves
   it, or is a standing alert enough?
3. Should the import wizard **update** existing volunteers matched by phone
   rather than only skipping them as duplicates?
4. Photos: should a farmer be able to see volunteers' faces before the group
   confirms arrival, or only once they are on site?
5. Are anchor-point instructions per-anchor, or should some be programme-wide
   defaults inherited by every anchor?
6. **Are the dispatch weights right?** 0.45/km vs 1.2/guard means ~2.7 km of
   travel is worth one guard of seniority. That ratio is a guess and should be
   checked against how the coordinator actually chooses.
7. **Should a refusal be remembered across guards?** Right now the exclusion
   set is per-wizard-session; someone who declines three nights running still
   ranks first on the fourth.
7bis. **⚠️ OPEN, AND IT NEEDS THE PO — the horizontal scroll of PO return 5 was
   never reproduced here.** Before anything was changed, the demo build was
   swept for page-level horizontal scroll at 320, 390, 768, 1024, 1100, 1280,
   1376, 1440 and 1920 px, at splitter ratios 25 / 50 / 75, over sixteen
   screens, on **Chromium AND WebKit** — WebKit being the engine on his iPad —
   measuring both `scrollWidth` and the document's real scroll range. Nothing
   scrolled. A genuine latent defect was found and fixed on the way (`min-w-0`
   missing on `MapSplit`'s map column, §12bis.5) and the rule is now permanent
   in `bun run layout`, but **a green gate is not the same as a reproduction.**
   What would settle it: the SCREEN, the WINDOW WIDTH, whether the app was in a
   browser tab or installed, and whether the rail was expanded — that last is
   the one axis the sweep still does not drive.
8. **RESOLVED BY G17 (2026-08-18):** the Artzenu faces are deleted and every
   self-hosted face is OFL — there is no licence question left. Kept for the
   record; the original concern follows.
   **⚠️ (obsolete) — do the Artzenu font licences cover this app?**
   אטלס (Atlas) and מקומי (Mekomi) are commercial Hebrew typefaces. The eight
   woff2 files in `public/fonts` are the association's own, taken from the
   association's own site, for the association's own tool — but a web licence
   covering `artzenu.org.il` does not automatically extend to a second
   application. Confirm with Artzenu before Lot 1 ships. Rollback if it is not
   covered: delete the `atlas-*`/`mekomi-*` files. That is the whole change — the
   stacks in `--font-brand` / `--font-sans` already fall through to the
   self-hosted Rubik, and nothing else in the app depends on them.
11. **✅ RESOLVED BY THE PRODUCT OWNER (2026-08-31) — SEE DECISION 71.** The
    answer is PMTiles, self-hosted, one file, vector, tinted; the OSM
    pre-cache is abandoned for good. Scheduled after P2.6/P2.5b, before P3.4.
    The measurement that produced the recommendation is kept below, because it
    is the whole justification and it will be asked for again.

    **⚠️ (settled) THE "רענן מפות לא מקוונות" BUTTON CANNOT BE BUILT ON OSM, AND
    THE REASON IS A POLICY, NOT A LIMIT (P2.5a, 2026-08-31).** The order of march
    asks for ~50–80 MB of pre-cached Negev tiles behind a button. The estimate
    was right — measured over the gazetteer's own bbox
    (30.84–32.08 N, 34.42–35.45 E, +0.15° pad):

    | zoom | tiles | cumulative | ≈ size @12 kB |
    |---|---|---|---|
    | z9–z12 | 313 | 313 | 4 MB |
    | z13 | 816 | 1 129 | 13 MB |
    | **z14** | **3 216** | **4 345** | **51 MB** |
    | z15 | 12 502 | 16 847 | 197 MB — too much |

    **4 345 requests in a burst, per device, per refresh, is exactly what
    OpenStreetMap's Tile Usage Policy forbids** ("systematic downloads are not
    permitted"), on infrastructure that is donated. It would also, in
    practice, get the address blocked. So the button is NOT built, and what
    shipped instead is the honest half: a BROWSING cache — ground the
    coordinator has actually looked at stays available offline, which is real
    and costs OSM nothing.

    **THE RECOMMENDED ANSWER IS PROTOMAPS PMTILES, SELF-HOSTED**, and it is
    recommended because it settles three things at once: no API key and no
    usage policy to breach; ONE file to cache rather than four thousand
    requests, which is what "offline maps" should have meant all along; and it
    is VECTOR, so the map can finally be themed in the app's own colours
    instead of approximated with a CSS `hue-rotate` on a raster — which is
    standing carry-in item 2, still open since Lot 0.9. Hosting is a public
    Supabase Storage bucket (free tier: 1 GB stored, 5 GB egress; PMTiles reads
    it with HTTP range requests). Cost: 0. The work is a new map style and a
    tile-extract step whose toolchain must be checked first.
    The alternatives are a keyed provider (MapTiler/Stadia — signup, a key,
    and bulk offline usually needs a paid plan), or keeping the browsing cache
    and dropping the button.

10. **WILL THE ASSOCIATION FUND THE WHATSAPP BUSINESS API?** P0bis.5's ceiling
    is legal, not technical: no third-party application may send a WhatsApp on
    a user's behalf or create a group for him, so the sending centre hands off
    to the coordinator's own apps. The WhatsApp Business API removes that
    ceiling — messages sent by the server, groups created programmatically —
    at a monthly cost and behind Meta's business verification. It is a
    PRODUCT decision with a price attached, not an engineering one, and
    nothing in the app has to change until the answer is yes. Email is
    already on the automatic path (P3.3bis) and needs no such permission.

9. **Is the sea meant to be violet on the night map?** The single hue rotation
   that lands the Negev on forest green necessarily throws the Mediterranean the
   other way (`docs/brand-artzenu.md` §3). It is desaturated almost to neutral
   and only a corner of the frame, but if the coordinator finds it distracting
   the fix is a keyed vector provider in Lot 1, not another rotation.

---

## 12. Next step

**PHASE P0bis IS COMPLETE AND THE POC IS FROZEN (G13).** Five units, five
commits, all gates green, deployed and verified live:

| Unit | What it did | Its gate |
|---|---|---|
| P0bis.1 | the map is on the physical LEFT on every screen that has one | `mapfirst` — 26 screens |
| P0bis.2 | the map/content seam is a draggable splitter | `splitter` — 72 checks |
| P0bis.3 | the density pass, screen by screen | the table in §1 |
| P0bis.4 | the generated .xlsx is really RTL | `rtl` — 45 checks |
| P0bis.5 | the email field, the sending centre, the group kit | `outreach` — 25 checks |

**THE TWO URLS, both verified 200 after the G13 deploy:**
· the app, and it keeps moving — https://azmer-fts.github.io/lo-yanum/
· the FROZEN poc, never redeployed — https://azmer-fts.github.io/lo-yanum/poc/

**P2.3 (AUTH) IS DONE. `bun run auth` — 20 checks, green.** The deployed app
requires a Supabase session; `/poc` stays open on demo data; the identity
picker and the role switcher exist only in a demo build.

**The invitation email was never sent, and the reason is a standing decision,
not a failure.** `auth/v1/invite` requires the `service_role` key, which this
project never fetches, never commits and never lets near the client; the
Supabase MCP exposes no auth-admin tool either. The product owner therefore
created the account himself, in **Authentication → Users → Add user → Create
new user**, choosing his own password with **Auto Confirm User** ticked. That
is Supabase's own flow, it needs no redirect-URL configuration, and no link
expires. **Nobody but the PO has ever typed that password; do not ask for it,
and no gate needs it.** See decision 70.

**THE ACCOUNT EXISTS AND IS HABILITATED (2026-08-30).**
`dov@serialkolors.com`, uid `c9617ce1-8914-4795-bc53-56bab7b30fa5`, created and
auto-confirmed by the PO in the dashboard; `20260830000400_coordinator_grant.sql`
applied on top. An auth account is not yet a coordinator — `app_users` is where a
login becomes somebody, and the schema says "a user with no row here is nobody" —
so skipping that migration produces the worst possible symptom: a successful
sign-in onto 26 empty tables with no error anywhere.

**HOW THE GRANT WAS VERIFIED WITHOUT THE PASSWORD**, and the same query re-runs
any time the question comes back. Every coordinator policy is literally
`using (private.is_coordinator())`, so proving that function is proving the
path:

```sql
with cfg as materialized (
  select set_config('request.jwt.claims',
           '{"sub":"<uid>","role":"authenticated"}', true) as a
)
select auth.uid()::text, private.app_role(), private.is_coordinator() from cfg;
```

· dov's uid            → `coordinator`, **true**
· any other uid        → `null`, **false**

> ✅ **THE DASHBOARD HARDENING IS DONE, AND ONE ITEM OF IT IS NOT PURCHASABLE
> HERE (PO, 2026-08-31 — decision 72).** Sign-ups are OFF, the minimum password
> length is 10, and the leaked-password switch was thrown. It did NOT take:
> `get_advisors(security)` still returns `auth_leaked_password_protection` as
> WARN, because the feature is **Pro Plan and above** in Supabase's own
> documentation. Stop reading that lint as a forgotten switch — it is an
> upgrade line item. The JWT expiry could not be read from this machine
> (decision 72 says exactly why, and why it is not the anti-lockout insurance
> anyway — P2.5b is).

> **BEFORE THE NEXT DEPLOY:** the two repository secrets
> `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` must exist in
> GitHub → Settings → Secrets and variables → Actions. Both values are public
> by design (`.env.example` carries them); they are secrets so that rotating
> the key is a settings change and not a commit. **If either is missing the
> build still SUCCEEDS and silently ships DEMO MODE** — the mock store, the
> role switcher, no login. Check the deployed site shows the login form.

⚠️ **AND UNTIL P2.6 LANDS, THE LOGIN GUARDS MOCK DATA.** P2.3 built the door,
not the rooms: a signed-in coordinator sees the same 12 farms and 300
volunteers the POC shows, and nothing he types reaches Supabase. The database
is deliberately empty. Say so to anyone who is shown the deployed app before
P2.6.

**P2.4 (STORAGE) IS DONE. `bun run storage` — 10 checks, green.** Two PRIVATE
buckets, applied as `20260830000500_storage.sql`:

| Bucket | Key shape | Limits |
|---|---|---|
| `photos` | `<kind>/<id>/<filename>`, kind ∈ entities/contacts/volunteers/drivers | 5 MB, jpeg/png/webp |
| `agreements` | `<entity_id>/<agreement_id>.pdf` | 20 MB, pdf |

The id is a FOLDER, not a filename stem, so replacing a portrait busts every
cached signed URL without touching the row that points at it — and so
`storage.foldername(name)[1]/[2]` gives the policies the kind and the id.

**THE READ RULE IS ONE POLICY: "you may see the photo of anything you may
see."** It does not restate who may read a volunteer, it ASKS —
`exists (select 1 from volunteers where id = …)` — and Postgres applies RLS to
tables referenced inside a policy expression, so that `exists` is answered by
the policies P2.2 already transcribed from `access.ts`. Nobody has to remember
to update the storage file when an access rule changes, which is exactly the
kind of remembering that fails. Writes are coordinator-only in both buckets.
`get_advisors(security)` returns no lints.

> **This resolves ETAT open question 4 by preserving today's behaviour, and it
> should be said rather than slipped in:** a farmer CAN see the faces of the
> volunteers coming to his farm from the moment the guard is planned. That is
> what `FarmerTonightScreen` already renders and what P2.2 already grants for
> their NAMES. If the answer is meant to be "only once they are on site", the
> change is one added clause in the storage migration, next to the rule it
> qualifies.

**P2.5a (THE OFFLINE SHELL) IS DONE. `bun run offline` — 11 checks, green.**
Service worker, offline badge, הגדרות, and one online load is enough for the
app — /poc included — to survive with no network.

> **P2.5 IS SPLIT, and the reason is a dependency the written order missed.**
> Its DATA half (IndexedDB read cache, write outbox, last-write-wins) cannot
> precede P2.6: an outbox flushing to the mock store has nothing to flush, and
> a read cache over demo fixtures would make a reload PERSIST them —
> contradicting "the real app starts EMPTY" head-on. Agreed with the PO on
> 2026-08-31. **P2.6 → P2.5b.**

> **THE TILE PRE-CACHE BUTTON IS DECIDED (PO, 2026-08-31): PMTILES,
> SELF-HOSTED.** Open question 11 is closed and decision 71 records it. The
> OSM pre-cache is abandoned for good; what P2.5a shipped — a browsing cache —
> stays, and the one-file download lands after P2.5b and before P3.4.

**P2.6 (THE REAL SWITCH) IS DONE, IN TWO HALVES AND FOUR COMMITS.**
`bun run persist` — 84 · `bun run mapping` — 33 · `bun run live` — 46.

| Half | What it did | Its gate |
|---|---|---|
| P2.6a | the store became an INTERFACE; the current behaviour moved behind it as the demo implementation, and NOTHING changed | `persist` 84 + every pre-existing gate re-run green |
| P2.6b | the Supabase implementation: empty first frame, one hydration, a serial write-through | `mapping` 33 + `live` 46 |

**THE ORDER WAS THE POINT AND IT PAID.** P2.6a shipped with the demo backend
still the default and all eleven browser gates re-run green BEFORE a line of
Supabase reading existed, so when P2.6b broke something there was exactly one
place it could have come from. `accept` 150, `dispatch` 27, `mapfirst` 27
screens, `splitter` 72, `wizard` 28, `touch` 32, `import` 29, `rtl` 45,
`outreach` 25, `layout` at four viewports, `auth` 20, `storage` 10,
`offline` 11 — all green at P2.6a, all green again at the end.

**THE FOUR FILES, AND WHAT EACH ONE IS FOR:**
· `src/core/backend.ts` — the interface, and the change derivation. Decisions
  73 and 74 are written out in it at length because they are the two that a
  later reader would otherwise undo.
· `src/core/demo.ts` — the fixtures, moved out of `store.ts` at last, plus
  `emptyData()` and `EMPTY_BACKEND`.
· `src/data/rows.ts` — the ONE place that knows both shapes. 26 tables, both
  directions, and nothing else in the app knows a column name.
· `src/data/store.ts` — the Supabase backend.

**THREE THINGS IN `src/data/store.ts` THAT ARE NOT OBVIOUS:**
· **Reads PAGE.** PostgREST caps a select at 1 000 rows and does it SILENTLY:
  a roster of 1 200 volunteers comes back as 1 000 and looks complete.
· **Writes are ONE SERIAL QUEUE.** Creating a farm and immediately drawing a
  zone on it emits two changes a millisecond apart, and a zone whose entity
  does not exist yet is a REJECTED insert, not a slow one.
· **Child tables are cleared in REVERSE and inserted FORWARD.**
  `presence_marks` references `mission_assignments`; `mission_driver_passengers`
  references `mission_drivers`. The other order is refused, correctly.

**`onWriteFailed` IS A NAMED SEAM WITH A PLACEHOLDER BODY, ON PURPOSE.** P2.5b
replaces its body — outbox in, badge up — and nothing else. The alternative, a
try/catch inlined in a loop, is a thing somebody would have to find again.

**`DataBanner` IS THE ONE ADDITION TO THE SHELL, AND IT EXISTS FOR THE FAILURE
THIS FILE ALREADY NAMED AS THE WORST AVAILABLE:** signed in with no `app_users`
row looks exactly like a database nobody has imported into — 26 empty screens
and not one error. It loads its module lazily, so a demo build never fetches
the data layer at all.

★ **WHAT `bun run mapping` FOUND ON ITS FIRST RUN, which is the argument for
having written it before trusting the mapper.** Two of them, and neither could
have been noticed by any gate that existed, because nothing had ever tried to
write a volunteer's address to Postgres:
1. **THE SCHEMA HAD FALLEN BEHIND `types.ts` BY TWO UNITS.** P0bis.5a's
   optional `email` never reached `volunteers`, `drivers` or
   `entity_contacts`; P0bis.5b's outreach `event` never reached
   `cancel_notices`. `20260831000100_p26_catchup.sql`, applied 2026-08-31 with
   the PO's explicit approval and verified by introspection.
2. **TWO THREAT FIXTURES SPELLED `updatedAt` AS A `+03:00` OFFSET LITERAL**
   where every other timestamp in the store is UTC. Same instant, renders
   identically — and a snapshot holding two spellings of one timestamp is a
   structural diff reporting a change that did not happen, the moment the same
   value comes back from Postgres in the other spelling.

★ **AND `scripts/samples.ts` EXISTS BECAUSE OF WHAT THE FIRST DRAFT COULD NOT
SEE.** Reading only the FIRST aggregate of each collection is the obvious
version: an aggregate whose child list is empty writes no row, so that child's
table is never probed at all. `cancel_notices` was exactly that — no fixture
guard carries an outreach tick, because a tick is something a coordinator does
rather than something a fixture is — **and it was also the table the catch-up
had to change. The one table nobody could see was the one that was wrong.**

★ **`bun run live` NEEDS NO PASSWORD, AND THE REASON IS ONE PROPERTY OF
POSTGREST:** `?select=` is resolved against the schema BEFORE row-level
security runs. A missing column comes back 400/42703 naming itself; an existing
one comes back `[]`, the rows being exactly what RLS refuses. So the
DEPLOYMENT can be asked what the migration FILES only claim — and the files say
what was written, not what was applied. 24 tables column by column, 15 enums
label by label, `app_users` closed to a stranger. Nothing crosses the wire that
is not already public in these migrations.

✅ **THE WRITE PATH IS NOW PROVED END TO END — `bun run write`, 35 checks,
against Frankfurt (2026-08-31).** Sign in → the grant resolves → 17 aggregates
across all 25 tables go in through `applyChanges` → come back through
`hydrateFrom` identical → a second write UPDATES rather than duplicates and a
removed child is really gone → everything is deleted and the database is
exactly as the run found it. Re-run twice: idempotent, and it leaves nothing.

⚠️⚠️ **AND THE ACCOUNT THAT MADE THAT POSSIBLE MUST BE DELETED BEFORE P3.1.**
`dov+test@serialkolors.com`, uid `304d2f3b-90ca-43dc-bfac-1361c8184303`,
created by the PO in the dashboard on 2026-08-31 for this purpose alone, with
a disposable password that lives in `.env.test` and is **git-ignored**. It
carries the `coordinator` grant, which is total read and write over every
farmer's phone number, every volunteer's face and the threat layer. **Today
that is a grant over nothing, because the database is empty. From the first
imported farm it is a second door onto the programme's data.** Two steps, both
required, both written out in
`supabase/migrations/20260831000200_test_account_grant.sql`:
  1. dashboard → Authentication → Users → `dov+test@…` → Delete user
  2. `delete from app_users where user_id = '304d2f3b-…';` — run it and check
     it returns 0 rows, because "probably cascaded" is not a thing to be
     probably about
Then delete `.env.test`. `bun run write` will fail at its first check, loudly:
**that is the intended end state, not a regression.** The final report of the
session that does P3.1 must confirm the deletion.

**(historical) THE GAP THIS CLOSED, kept because the reasoning recurs:** Everything above proves the mapper is lossless, that the live
schema accepts every column and every enum label the mapper writes, and that
every mutation emits the right aggregates. What is NOT under an automated gate
is "the coordinator edits a farm, it reaches Postgres, and it is still there
after a reload" — because that needs a session, and a session needs a password.
The PO's password must never reach this repository (decision 70); there is **no
Docker on this machine**, so `supabase start` and a local stack are not
available; and self sign-up is now off (decision 72). **The PO agreed on
2026-08-31 to create a disposable test account** — the same one `bun run
storage` has been asking for since P2.4. Until it exists, verify by hand at
first sign-in: sign in, create a farm, reload, check it is still there.


---

**THE ORIGINAL P2.6 BRIEF IS KEPT BELOW**, because the constraint it names is
the one that decided the design and will be asked about again.

**(delivered) P2.6:** the store becomes an INTERFACE, satisfied by a demo
implementation (the mock fixtures, which is what /poc keeps) and a Supabase
one. **No screen changes.** The real app starts EMPTY.

**MEASURE IT BEFORE STARTING: 53 mutations, 52 accessors, 2 743 lines across
`store.ts` + `access.ts` + `types.ts`.** This is the largest unit in P2 and the
only one that can silently break every screen at once.

★ **THE CONSTRAINT THAT DECIDES THE WHOLE DESIGN, and it is not obvious.**
"No screen changes" and "reads come from Postgres" are only compatible one
way. Every screen reads through `access.ts` **synchronously** — `useCoreValue`
re-runs a selector on each store version bump — so the Supabase implementation
**must not make reads async**. It has to keep the same in-memory snapshot the
mock store keeps, HYDRATE it from Supabase once, and WRITE THROUGH on every
mutation, bumping the version exactly as `store.ts` does today. Turning the 52
accessors into promises would mean touching every screen, which is the one
thing this unit is forbidden to do.

That shape is also why P2.5b comes after: the snapshot the Supabase
implementation holds is precisely the thing IndexedDB persists, and the
write-through path is precisely where the outbox is inserted. Getting P2.6's
shape right makes P2.5b small; getting it wrong makes P2.5b impossible.

Sequence that keeps the gates honest: define the interface and move the CURRENT
behaviour behind it as the demo implementation FIRST, and prove `accept` (150)
plus every browser gate still green before a single line of Supabase reading is
written. Only then add the second implementation. The 26 tables map to a nested
domain model — `Farm` carries contacts/zones/agreements/commitments, `Mission`
carries assignments/drivers/passengers/presence marks — so hydration is a
handful of joins assembled in TS, not 26 independent fetches.

The database is EMPTY, so the first correct result of the Supabase
implementation is every screen showing its empty state. That is success, not a
bug — and it is the moment P3's real import stops being optional.

**(delivered) P2.5b** — the offline DATA layer: an IndexedDB read cache, a
coalescing write outbox with the "N ממתינים לסנכרון" badge, a documented
conflict rule, and an offline session. `sync` 28, `write` 38, `offline` 24.
**Criterion B2 is complete.** One correction to the written brief, recorded
because it was a judgement call: the brief said "last-write-wins **per changed
field**"; what shipped is **per AGGREGATE**, and the reasoning is written out
at length above `flushOutbox` in `src/data/cache.ts`. In short: the change
record P2.6 already produces IS the aggregate, phase 1 has exactly ONE
account so the only way to conflict is one person on two devices, and a
field-level merge cannot be explained to the person it surprises. If the PO
wants field-level, it is a change to `flushOutbox` and to `applyChanges`, not
to anything above them.

---

## 12bis. PO RETURNS OF 2026-08-31 — the seven points, and what each cost

The product owner tested the deployed app: he signed in, closed it, put the
iPad in aeroplane mode and reopened it. Seven points came back. Four of them
were features, two were defects he could see, and one — the seventh — is the
finish on the installed app. All seven are done and every one of them is under
a gate or a capture. **They are recorded here as one unit because they were
tested as one session and because three of them turned out to share a cause.**

### 1 · The eye on the password — `LoginScreen`

A 20-character password typed on an iPad keyboard, at night, into a field that
shows dots, is a login attempt with a coin flip in it — and three failures in a
row are a rate limit (`auth.errors.rateLimit` exists precisely because that
happens). The reveal button is a real **44 × 44 px** target, `aria-pressed` so
a screen reader can ask the CURRENT state rather than only be told it changed,
and `אין/הצג סיסמה` as its label in both directions.

★ **ITS POSITION IS PHYSICAL, NOT LOGICAL, AND THAT IS THE ONE INTERESTING
  LINE IN IT.** The field is `dir="ltr"` — a password is typed in Latin
  characters whatever the interface language — so its text always begins at the
  PHYSICAL left and grows right, in Hebrew and in English alike. Pinning the
  button with `end-*` follows the PAGE's direction and lands it on top of the
  first characters in one of the two. `right-0` / `pr-12` is the side the text
  never starts on, in both.

### 2 · The remembered address — `data/auth.ts`, `lo-yanum:last-email`

Written on every successful settle — a fresh sign-in AND a session restored
from storage, because the claim is "the last address that got in" and a
restored session got in. Read ONCE, as `useState`'s initial value, so the field
stays a plain editable input rather than one that fights anybody typing a
different address. `autocomplete="username"` and `autocomplete="current-
password"` were already correct and are unchanged; the iOS keychain was always
able to fill this form.

★ **IT DELIBERATELY SURVIVES AN EXPLICIT SIGN-OUT, which is the one place it
  parts company with `LAST_SESSION_KEY`.** That key is an ACTIVE SESSION and
  clearing it is the whole of "I have finished with this iPad" (P2.5b's
  asymmetry). This one is a form default, and clearing it would make the
  feature useless in exactly the flow it exists for: sign out at the end of a
  night, come back the next evening, find the field filled. Phase 1 has ONE
  account. **If a shared device ever has to forget the address too, that is a
  "forget this address" control next to the field, not a silent wipe on
  sign-out** — and it is the PO's call, not a change to make quietly.

### 3 · The offline door — joins criterion B2

Two halves, and the first was already true. `bun run offline` has proved since
P2.5b that an offline RELOAD keeps the coordinator inside the app with his
cache and no login form — which IS the PO's scenario (session established, app
closed, aeroplane mode, app reopened). What was missing:

· **the offline badge on the reopened app.** Being let in is only reassuring if
  the app also admits WHY the numbers might be an hour old. Now asserted.
· **the door's own message.** A first sign-in genuinely cannot happen without a
  network — the password is checked by Supabase and by nothing on the device —
  and that is a structural limit the app is allowed to have. What it is not
  allowed to do is dress it up as a server problem: *"אין חיבור לשרת. בדקו את
  החיבור ונסו שוב"* is advice, and it is advice that cannot be followed by
  someone in a wadi. The screen now says
  **`אין חיבור לאינטרנט — נדרש חיבור להתחברות ראשונה`**, ABOVE the button and
  before a password has been typed and lost, and says the same thing rather
  than the generic one if he submits anyway.

### 4 · The Supabase keep-alive — `.github/workflows/keepalive.yml`

A free project is paused after roughly a week of inactivity, and the first
thing that happens is the coordinator's login failing at the hour he can do
least about it. A scheduled `GET /rest/v1/entities?select=id&limit=1` with the
PUBLISHABLE key, every two days.

★ **THE FORM OF THE REQUEST IS THE WHOLE DESIGN.** It had to be one that
  provably reaches POSTGRES, not one a gateway can answer alone. PostgREST
  resolves `?select=` against the schema and then runs a real query; the
  anonymous role has no policy on `entities` (P2.2, criterion B1), so RLS
  filters every row out and the answer is **`200 []`** — measured, not assumed.
  That answer is both the success case and the proof: the database woke up,
  planned a query, applied its policies and answered, and nothing was read
  because there is nothing anonymous may read. `/auth/v1/health` is GoTrue and
  says nothing about the database; `/rest/v1/` is refused outright (401, "Only
  secret API keys can be used for this endpoint") before Postgres is consulted.
  Both were tried against the live project.

Every two days and not every six: it leaves two whole misfires' worth of margin
inside the seven-day window, and GitHub's scheduler is explicitly best-effort.
A 2xx passes; a **4xx passes with a warning**, because a processed request is
still an awake database and this must not fail at 06:12 over something that is
not an outage; only silence and a 5xx fail, because those are the shapes a
PAUSED project has. Both paths were run locally against the real project before
committing.

⚠️ **DELETE THIS FILE THE DAY THE PROJECT GOES PAID.** Paid projects are not
paused for inactivity, so it becomes a request that costs egress and proves
nothing.

⚠️ **AND THE ONE THING IT CANNOT DO FOR ITSELF:** GitHub disables scheduled
workflows in a PUBLIC repository after 60 days with no commits. If work on Lo
Yanum stops for two months, this stops with it and the project pauses a week
later. `workflow_dispatch` is the manual way back.

### 5 · The horizontal scroll — and what the sweep found

**THE RULE IS NOW PERMANENT AND ABSOLUTE: no screen may scroll horizontally at
the PAGE level, at any width and at any position of the splitter.** A wide
table scrolling inside its own `.table-scroll` box stays legitimate; the whole
document sliding sideways never is. `bun run layout` enforces it.

★ **THE SEAM IS A DIMENSION OF THE SWEEP, AND IT COSTS NO EXTRA PAGE LOADS.**
  `PanelSplitter` is a `role="separator"` with `End` → 25 % and `Home` → 75 %,
  so the gate FOCUSES THE REAL CONTROL and presses two keys, measuring the
  screen's own default as the third stop. Seeding `lo-yanum:map-ratio:*` would
  have cost three page loads per screen — and the sweep's entire runtime is
  page loads — and would have tested the number a test wrote into storage
  rather than the ratio the app applies. Screens with no seam at that width
  print `no seam` rather than silently collapsing the dimension to one.

★ **TWO INSTRUMENTS, BECAUSE `scrollWidth` ALONE IS NOT ENOUGH IN AN RTL APP.**
  Overflow in Hebrew goes LEFT, into negative `scrollLeft`. The audit now also
  asks the document to move — `scrollLeft = -99999`, then `+99999`, then back,
  within one frame — and reports how far it went. Zero on a healthy screen in
  both directions.

**WHAT WAS FIXED:** `MapSplit`'s MAP column never carried `min-w-0` while the
content column has since Lot 0.9 — an asymmetry with no reason behind it and
the exact shape of the reported defect. A flex item's `min-width` defaults to
`auto` ("never shrink below your own content's minimum"), and a map canvas is
the worst possible thing to leave under that rule: MapLibre sizes the
`<canvas>` in device pixels from a ResizeObserver, so during a drag there is
always a frame where the canvas is as wide as the panel USED to be. With
`min-width: auto` that frame is a page that scrolls. It cannot shrink anything
that was not already meant to shrink — `flex-1` is `flex: 1 1 0%`, so the
declared basis was already zero and `auto` was only overriding it from below.

⚠️ **AND THE HONEST PART: THE SYMPTOM DID NOT REPRODUCE HERE, and the PO should
know that before he reads a green gate as "fixed".** Before touching anything,
the demo build was swept for page-level horizontal scroll at **320, 390, 768,
1024, 1100, 1280, 1376, 1440 and 1920 px**, at splitter ratios **25 / 50 / 75**,
over sixteen screens, on **Chromium AND WebKit** (WebKit is the engine on his
iPad), measuring both `scrollWidth` and the real scroll range. **Nothing
scrolled.** So: the `min-w-0` fix is a real latent defect closed and a
plausible cause of exactly what he saw, the gate is permanent and green, and
the reproduction is still open. **If it recurs, the two things worth writing
down are the SCREEN and the WINDOW WIDTH** — and whether the rail was expanded,
which is the one axis this sweep does not yet drive.

### 6 · The grey band at the foot of the real app — a token, not a component

**THE CAUSE WAS `--shell-bottom: 2.75rem` IN `tokens.css`, AND IT IS THE MOST
INSTRUCTIVE THING IN THIS WHOLE UNIT.** That value was an ESTIMATE of
`DevToolbar`'s height, deliberately left as a default on the reasoning that the
bar publishes its MEASURED height over the top of it (standing decision 39: the
offset is measured, not declared). Then P2.3 made that bar `return null` in a
real build — correctly, it hands out other people's identities — and with the
component gone, the effect that publishes never ran, **the estimate stood, and
every `100dvh` column in the real app stopped 44 px short of the bottom of the
screen.** What the PO saw as a grey band under the rail was the page's own
`surface-base` showing through a gap reserved for a control that no longer
exists.

★ **THE LESSON IS NOT "THE NUMBER WAS WRONG". IT IS THAT A FALLBACK FOR A
  MEASUREMENT IS A LIE THE MOMENT THE THING BEING MEASURED CAN BE ABSENT.** The
  default is now what a shell with nothing pinned at its foot actually owes —
  the iOS home-indicator inset, zero everywhere else — and `DevToolbar` carries
  that inset as its own bottom padding so the demo measurement still includes
  it.

Three smaller things went with it:
· the `sticky bottom-0` WRAPPER around `DevToolbar` is gone in a real build
  too. It was not the band — an empty sticky box has no height — but "the bar
  is removed and its container is still in the tree" is how a second band gets
  added back by the next person to put something in it.
· `FieldLayout`'s tab bar takes the home-indicator inset when it is the
  bottom-most element (a real build) and does not when `DevToolbar` is below it
  (demo). Exactly one of the two ever pads.
· **a duplicated `<SyncBadge />`** in the coordinator's mobile header, rendering
  the pending-sync pill twice at phone and iPad-portrait widths. Found while
  reading the file, unrelated to anything the PO reported.

`/poc` keeps its demo bar untouched — it is a separate frozen bundle (G13) and
nothing in this unit is deployed to it.

### 7 · The installed app's status bar — P3.4

In the installed app there is no browser toolbar: the page runs to the top edge
of the display and the system draws the clock, the battery and the signal bars
on the app's own pixels. Four parts:

· **A gradient**, `body::before`, `--status-inset × 1.25` tall, from the page's
  own `surface-base` to transparent — so it follows both themes with no second
  palette. It is `body::before` and not an element in the tree because
  P0bis.3's `.panel-scope` wrappers carry `container-type: inline-size`, which
  makes them containing blocks for `fixed` descendants; a JSX overlay would
  have to be hoisted to a root nobody may nest and kept there by discipline.
  **The height is a MULTIPLIER and not "the inset plus 8 px"**: a literal
  addition is right on an iPhone and draws an 8 px band across every desktop
  PWA, where there is no bar to sit under. Scaling collapses to nothing.
· **Every pinned bar clears the system zone** — the rail, both sticky headers,
  the slide-over — by ADDING the inset to its own padding. The first draft of
  this was a `.safe-top` class in `index.css` and it was quietly wrong: those
  bars carry `py-3`/`py-4`, a rule that sets `padding-top` REPLACES the
  utility's, and `.safe-top` would have won on specificity and thrown the bar's
  own breathing room away — leaving the brand jammed against the clock on
  exactly the device this is for.
· **Content starts below the zone and scrolls under it.** `lg:` only: below the
  breakpoint the content sits under a header that already pads, past it there
  is no header at all and the first card of every screen would come to REST
  under the clock, where iOS takes the taps.
· **`--shell-top` falls back to the inset**, which needed one more change:
  `usePublishedHeight` now REMOVES its property when the measured element is
  zero-height instead of writing `0px`. The coordinator's top bar is
  `lg:hidden`, so on a desktop or a landscape iPad it measures 0 — and writing
  `0px` pinned an inline style over the token default with no way back to it.

★ **THE SWEEP FOUND THREE CONTROLS IN THE SYSTEM ZONE THAT NOBODY WOULD HAVE
  FOUND BY LOOKING, AND ONE OF THEM WAS THE SEAM.** The first version of the
  assertion asked only about controls inside viewport-PINNED bars and passed
  everything; the first capture then showed MapLibre's zoom buttons sitting in
  the top 24 px of every map screen. Widened to "every interactive element at
  REST in the zone" — the page is at the top of its scroll, so what it finds is
  what a coordinator ARRIVING on a screen cannot press — it found:
  · **`PanelSplitter`**, `self-stretch` from y=0. The one control P0bis.2
    exists to let him drag, with its top 24 px under the clock.
  · **MapLibre's zoom buttons**, and the farm detail's map overlay button.
  · **`CreateGuardFab`**, at a hard-coded `bottom-16` chosen to clear the demo
    toolbar — **the same anti-pattern as the `--shell-bottom` default in
    point 6**, and it failed the same way the moment that bar grew by an
    iPhone's home-indicator inset: the button landed ON the bar. It is now
    `bottom-[calc(var(--shell-bottom)+1.25rem)]`, so the only number left to
    choose is the gap.

  The first three are fixed at the source rather than one by one: **the
  MapSplit SHELL takes the inset** (`lg:pt-[var(--shell-top)]`, both scroll
  strategies), so every column and the seam between them begins below the
  system zone from one declaration — and `box-sizing: border-box` means the
  `panel` strategy's declared `100dvh − --shell-bottom` still ends where it did.
  The `page` strategy's map column and seam are additionally
  `sticky top-[var(--shell-top)]`, which was right all along and does not
  double up.

★ **AND THE SWEEP THEN CAUGHT THE FIRST ATTEMPT AT THAT FIX BEING HALF RIGHT,
  WHICH IS THE BEST THING IT DID ALL UNIT.** The inset was written as `xl:` on
  the `xl` variant and `lg:` on the `lg` one — which reads as obviously correct
  and is wrong. At **iPad PORTRAIT, 1032 px**, the four `xl` screens (farm
  detail, farm form, anchor sheet, mission detail) are still STACKED, so an
  `xl:` offset has not kicked in — while the coordinator's top bar is
  `lg:hidden` and has ALREADY gone. Four screens with no header and no offset,
  and the map's own bar — carrying the three-state mode switch — sitting under
  the clock. The question the padding answers is **"is there a shell header
  above me", which `lg` decides, not "how does this screen lay its map out",
  which is what the variant is about.** Both variants now use `lg:`, and the
  comment in `MapSplit.tsx` says why, because it will read as a copy-paste slip
  to the next person.

★ **AND THE WHOLE OF IT IS SIMULABLE, WHICH IS WHY THE INSETS ARE TOKENS.**
  Playwright can emulate a viewport, a locale, a colour scheme and a position;
  **it cannot emulate a notch, and no flag will make it.** So `tokens.css` reads
  `env(safe-area-inset-*)` ONCE into `--status-inset` / `--safe-bottom` and
  every rule in the app reads those. `STANDALONE=1 bun run layout` stamps
  `data-standalone` and the two variables with the real devices' numbers (59 px
  on an iPhone 16 Pro, 47 px on the 390-class phones, 24 px on an iPad Pro) and
  runs the ENTIRE sweep as the installed app, asserting the gradient's height
  and that **no control inside a viewport-pinned bar rests in the system zone**.
  Captures land in `docs/screenshots/standalone/`.

★ **ONE JUDGEMENT CALL, AND IT IS THE PO'S TO OVERTURN:
  `apple-mobile-web-app-status-bar-style: black-translucent` IS NOT USED.** It
  is the only way on iOS to force content edge-to-edge under the bar — and it
  also forces the clock and the battery to WHITE, permanently. The
  coordinator's default theme is LIGHT (`defaultThemeFor`), so that trade buys
  an edge-to-edge bar and pays for it with an unreadable clock for the one
  person in phase 1 who has an account; and "adapt the gradient to both themes"
  is the same requirement read from the other end. What is used instead is
  `viewport-fit=cover` plus a `theme-color` that theme.tsx already keeps in step
  with the resolved `--surface-base`, so the status-bar region is the app's own
  background in whichever theme is showing — never a white band — and the
  system picks contrasting glyphs against it. `mobile-web-app-capable` and
  `apple-mobile-web-app-capable` were added; the status-bar-style line is one
  line in `index.html` if he wants the other trade.

### What was re-run, and what it cost

**Every gate, green.** `typecheck`, `tokens`, `contrast`, `accept` (150),
`dispatch` (27), `sync` (28), `persist` (84), `mapping` (33), `auth` (20),
`offline` (**27**, up from 24), `layout` (24 screens × 3 seam positions ×
4 viewports, in BOTH the browser and the installed app), `mapfirst` (27),
`splitter` (72), `touch` (32), `wizard` (28), `outreach`, `rtl`, `import` (29).

`mapfirst`, `splitter` and `touch` were not optional here and would not be for
the next unit either: this one changed `MapSplit`, and ETAT has named those
three as the thing to run first on any map change since P0bis.

**Verified against the real project, not against a mock**: points 1, 2 and 3
were driven through a real build signed in as the disposable test account —
the address is remembered across a sign-out AND a reload, the password field
comes back empty, `lo-yanum:last-session` is cleared, and the reveal button
measures exactly 44 × 44. The keep-alive's script body was executed verbatim
against Frankfurt (`200 []`) and against an unresolvable host (three attempts,
exit 1), so both halves of its verdict are measured rather than reasoned.

---

## 12ter. PMTILES — STEPS 1 AND 2 ARE DONE (2026-08-31)

**THE EXTRACT AND THE BUCKET ARE REAL AND MEASURED.** Both of the brief's
approval gates were put to the product owner before anything started, and both
were answered: `brew install pmtiles`, and a standing yes for the upload under
200 MB.

### 1 · The extract — 42 MB, and the dry run is why that number was cheap

`pmtiles` **1.31.2** from **homebrew-core** (bottled, BSD-3-Clause) — not a raw
GitHub release, because Homebrew already provides `bun` on this machine.

★ **`pmtiles extract --dry-run` ANSWERS "HOW BIG" WITHOUT DOWNLOADING ANYTHING**,
  which is what turned the size question from a commitment into a lookup. It
  was used to compare two candidates before a byte was fetched:

  | zoom | archive | notes |
  |---|---|---|
  | z0–**z14** | **42 MB** | ✅ chosen |
  | z0–z15 | 88 MB | doubles it, and crosses Supabase's 50 MB standard-upload cap into a resumable TUS upload |

  **z14 is much less of a compromise than the raster estimate made it sound,
  and this is the reason worth keeping:** MapLibre OVERZOOMS vector data by
  re-drawing the geometry, so past z14 lines and labels stay sharp. A raster
  past its maximum zoom just blurs. The brief's "z14 is where a farm track is
  legible" was a hard ceiling for raster and is a soft one here.

  Source: `https://build.protomaps.com/20260829.pmtiles` (the daily planet
  build; every date probed answered a range request with 206). bbox as the
  brief specified — `34.27,30.69,35.60,32.23`.

**Checked before uploading, as the brief insisted:** spec v3, tile type `mvt`,
bounds exactly the bbox, **min zoom 0 / max zoom 14**, `clustered: true`, OSM
data of 2026-08-29, attribution present. And not just the header — a real z14
tile at the Negev centre (`14/9775/6692`) decodes to **43 KB** across **9
vector layers**: `boundaries, buildings, earth, landcover, landuse, places,
pois, roads, water`. `roads` is the one that matters at 02:00.

### 2 · The bucket — the first PUBLIC one in this project

`supabase/migrations/20260831000300_basemap_bucket.sql`, applied. The migration
answers "why is this one public" next to P2.4's two private ones rather than in
a file nobody opens: it holds a picture of ground that is already public and
nothing about anybody in the programme.

★ **THE PO'S SIZE CEILING IS A COLUMN.** `file_size_limit = 209715200` IS the
  "under 200 MB" he authorised, so a future replacement that blows past it is
  refused by the database rather than by whether somebody remembered the
  conversation.

★ **THERE IS DELIBERATELY NO SELECT POLICY.** A public bucket is served from
  `/storage/v1/object/public/…`, a path that does not consult
  `storage.objects` at all — a permissive read policy here would look like the
  thing granting access while the `public` flag did the granting. Writes are
  coordinator-only, like both private buckets, which is what let the upload
  happen through a normal session and **without the service-role key this
  project never fetches**.

**Uploaded and verified end to end** — `basemap/negev-20260829-z14.pmtiles`,
the key stamped with the OSM build date so a replacement is a new URL:

| check | result |
|---|---|
| public URL | `HTTP 200` |
| `content-length` | **42 560 293** — byte-identical to the local file |
| `accept-ranges` | `bytes` |
| range `0-16383` | **206**, 16 384 bytes |
| range mid-file | **206**, 256 bytes |
| first 7 bytes | `PMTiles` — the archive survived the round trip |

⚠️ **AND ONE MEASURED LIMITATION, recorded rather than fought:** the custom
`cache-control: public, max-age=31536000, immutable` IS stored on the object
(`storage.objects.metadata->>'cacheControl'` confirms it) but the public
endpoint serves **`cache-control: no-cache`** on the free tier. There is an
`ETag` and Cloudflare reports `cf-cache-status: REVALIDATED`, so range requests
revalidate cheaply rather than re-downloading from origin — but it means
**step 5's service-worker cache is not only about being offline. It is what
makes the ONLINE path fast too**, and it should be built as such.

### 3–6 · The style, the swap, the button, and the filter that is gone

**`src/ui/components/basemap.ts` is the whole of the style**, and every colour
in it is a `tokens.css` variable read off `:root` at build time of the style.

★ **NOT "THE CHARTER'S GREENS" — THE BRIEF WAS STALE AND FOLLOWING IT WOULD
  HAVE BEEN ACTIVELY WRONG.** The brief predates **G17 (2026-08-18)**, which
  retired the Artzenu palette for the neutral blue-grey identity. Today
  `--zone-boundary` (#1E7A4F), `--zone-grazing` (#2FA372) and `--marker-farm`
  (#175E3B) are GREEN, because green is what a farm's ground MEANS on this
  map. A green basemap would have put every zone on top of its own colour and
  made the one thing the coordinator is looking at unfindable. So the basemap
  is deliberately QUIET — surface tones for land, border greys for roads, the
  app's ink for labels — and everything saturated on screen belongs to the
  programme. Water is the single hue spent, and it is `--accent` at 0.28 rather
  than the accent itself, because the accent is what a MARKER is.

★ **`setStyle` THROWS AWAY EVERY SOURCE AND LAYER THE APP ADDED, and that is
  the whole risk of the swap.** With a raster the theme was a CSS filter on the
  canvas and light/dark never reached MapLibre. A vector style holds its
  colours per layer, so the theme switch is a `setStyle` — and four sources and
  ten layers (zones, threat zones, threat vectors, the route) vanish with it,
  on 27 screens. The `load` handler is therefore extracted into
  `installProgrammeLayers`, called from `load` AND once after every `setStyle`.
  **It was already safe to re-run without anybody knowing**: P0.1 had written
  every layer to read its data from a REF rather than a closure, so that the
  handler could "apply it the moment the source exists, whatever order things
  mounted in". That property is what made this a extraction rather than a
  rewrite.

★ **THE HUE-ROTATE IS DELETED, AND OPEN QUESTION 9 CLOSES WITH IT.**
  `--map-filter` (three declarations) and `.map-night` are gone.
  `docs/brand-artzenu.md` §3 turned out to contain the ANSWER to question 9,
  written in 2026-08-18 and filed under the wrong heading: *"its inverse sits
  at ~14° and ends up violet"*. That IS the violet Mediterranean. A filter acts
  on every pixel including the ones that meant something, and the desert and
  the sea sit on opposite sides of the rotation — so no tuning could ever have
  fixed one without breaking the other. Closed by deletion, which was the only
  honest way.

★ **AND THE FIRST WORKING VERSION WAS QUIETLY NOT AN OFFLINE MAP.** It rendered
  perfectly and made **nine requests to `protomaps.github.io`** — two sprite
  files and seven glyph ranges. Criterion B3 would have failed on the first
  farm track, after 42 MB had been downloaded precisely so it would not. Caught
  by watching the NETWORK rather than by looking at the map. Vendored into
  `public/basemap-assets/`: both sprite sheets and **five** glyph ranges per
  weight rather than the three the first viewport asked for — Latin, Latin-ext,
  **Hebrew** and **Arabic**, plus punctuation. 1.2 MB, in the same `public/`
  where G17 already self-hosts the app's OFL faces for the same stated reason.

★ **AND HEBREW RENDERED BACKWARDS UNTIL THE RTL PLUGIN WENT IN.** MapLibre does
  not shape right-to-left text itself. The first capture read
  `סייגטלפה מיהוראל`; with `@mapbox/mapbox-gl-rtl-text` vendored next to the
  glyphs it reads `השטחים הפלסטיניים`, `באר שבע`, `דימונה`, `מצפה רמון`. A
  Hebrew app whose map is in mirror-writing would have been worse than the
  raster it replaced.

**THE BUTTON (step 5) — and the service worker underneath it.**

★ **THE CACHE API REFUSES A 206, WHICH DECIDES THE WHOLE DESIGN.** PMTiles
  reads by range request and `cache.put()` rejects partial responses outright,
  so the thousands of ranges can never be stored one by one. The only workable
  shape: hold ONE complete archive and SYNTHESISE the 206s in the worker. It
  slices a **Blob**, not an ArrayBuffer — `arrayBuffer()` would pull 42 MB into
  the worker's memory several times a second on an iPad, where `blob.slice()`
  stays backed by the browser's storage.

★ **A CONSEQUENCE WORTH STATING: BROWSING THE MAP ONLINE CACHES NOTHING.**
  There is no accidental path into the offline cache. The coordinator taps,
  having been told the size, or he has no map — which is the honest version of
  an offline map, and the one a settings screen can make a promise about.

★ **THE ONE EXCEPTION TO "NOTHING FROM SUPABASE IS EVER CACHED"** is drawn as
  narrowly as it can be: the PUBLIC object path of the `basemap` bucket, and
  nothing else. `/rest/v1/…`, `/auth/v1/…` and both private buckets stay
  uncacheable, so P2.5a's rule — and the gate's assertion of it — survive intact.

The הגדרות block now says **held or not held** and **how many bytes**, and the
button carries **the size before the tap** (read with a HEAD request, not
hard-coded, so a re-cut archive cannot make the screen lie). It replaces a
report that counted raster tiles and multiplied by an average: "3 812 tiles"
is a number nobody can act on — it does not say whether the track to a
particular farm is in it.

### And one defect that was NOT this unit's, found because this unit ran

⚠️ **`bun run offline` FAILED "signing out empties the device" on a loaded
machine, and it was a REAL P2.5b RACE rather than a flake.** `load()` ends with
`cache.clear()` then `cache.put()`; `onSignOut` also calls `cache.clear()`. A
sign-out landing between `hydrateFrom` returning and that write meant: the
sign-out empties the cache, and then the in-flight load fills it straight back
up **with the data of the person who just left**. On a shared iPad that is
exactly the failure the whole P2.5b asymmetry exists to prevent, and it is
invisible — the app shows the login form, and the next person's cold start
restores somebody else's farms.

★ **AND THE FIRST FIX WAS WRONG IN AN INSTRUCTIVE WAY.** It guarded on the AUTH
  STATE, which never fires in time: `signOut()` runs its handlers BEFORE it
  tells Supabase, so the auth state has not changed and `sync()` has not run
  while the window is open. **The signal that a load is void is the sign-out
  STARTING, not the auth state finishing** — so `onSignOut` now clears
  `loadedFor` as its first act, before the cache.

It went unnoticed for a lot because it is a race and the gate usually won it.
It lost on a machine busy running four browsers, which is the only reason it
was ever seen.

### What is left in this unit

**Nothing.** Steps 1–6 are done, `bun run offline` is **33/33**, and it is
deployed and verified signed-in on the live app — see the RESUME block below
for exactly what was checked on the artefact.

Every gate re-run green afterwards: `accept` 150, `layout` (24 screens × 3 seam
positions × 4 viewports, browser AND installed), `mapfirst` 27, `splitter` 72,
`touch` 32, `wizard` 28, `rtl` 45, `outreach` 25, `import` 29, `persist` 84,
`sync` 28, `tokens`, `contrast`, `typecheck`, `build`.
## 13. ⛔ P3.1 (FIN) — THE TEST ACCOUNT IS GONE. ALL THREE STEPS, VERIFIED (2026-08-31)

**`dov+test@serialkolors.com` (`304d2f3b-90ca-43dc-bfac-1361c8184303`) NO LONGER
EXISTS ANYWHERE.** Not in `auth`, not in `app_users`, not on this machine. The
countdown that has been at the top of this file since P2.6b is over, and the
`coordinator` grant that was a second door onto real farmers' phone numbers is
closed BEFORE the first farmer is imported rather than after.

| step | who | result |
|---|---|---|
| 1 · `auth.users` | ⛔ **THE PRODUCT OWNER**, dashboard → Authentication → Users → Delete user | ✅ done by him before this session |
| 2 · `app_users` | this session, `delete from app_users where user_id = '304d2f3b-…'` | ✅ ran, then **RE-READ: 0 rows** |
| 3 · `.env.test` | this session, `rm .env.test` | ✅ gone; it was never tracked (`.gitignore:20`) |

★ **STEP 2's DELETE MATCHED NOTHING, AND THAT IS THE POINT OF HAVING RE-READ.**
  The `app_users` row had ALREADY gone with the auth user — the FK cascades. But
  "probably cascaded" was exactly the thing this file said not to be probably
  about, so the statement was run anyway and the count taken afterwards. **The
  proof is the second query, not the first.** In one read:

  `app_users` rows for that id **0** · `auth.users` rows for that id **0** ·
  `auth.users` with an email like `dov+test%` **0** · leftover
  `auth.identities` **0** · leftover `auth.sessions` **0** ·
  and the whole of `auth.users` is now **1 row — `dov@serialkolors.com`**,
  holding the one `coordinator` grant in `app_users`.

**AND THE TWO GATES BEHAVE AS THIS FILE PREDICTED, which is how "deleted" was
confirmed from the outside as well as from the database:**

· `bun run write` **FAILS AT ITS FIRST CHECK, LOUDLY** — *"A76 needs the
  DISPOSABLE test account, and only that one… If the account has already been
  deleted before P3.1, that is the intended end state and this gate is meant to
  stop working."* Exit code 1. **This is not a regression and must never be
  "fixed".**
· `bun run offline` is **19/19 with its last section SKIPPED** — *"(no
  `.env.test` — the disposable account is gone, which is the end state)"*. It
  was 33/33 with the account; the 14 checks that are gone are the signed-in
  P2.5b half, and they are gone by design. **19/19 with one SKIP is now the
  green result for `offline`.**

### ⚠️ TWO RECORDS THE PRODUCT OWNER LEFT ON THE LIVE DATABASE, AND THEY ARE HIS

The database is NOT empty any more, and it is worth knowing why before P3.1's
import runs:

| table | id | name | created |
|---|---|---|---|
| `entities` | `farm-mth9x977-2` | `Kjuyh` | 2026-08-31 13:28 UTC |
| `drivers` | `driver-mth9l8zu-1` | `Yu` | 2026-08-31 13:19 UTC |

Both are keyboard-mash names typed by the PO while trying the deployed app, and
both post-date the write gate's last run. ★ **NEITHER IS AN `a76-` ID, which is
the check that matters** — A76 stamps every record it creates with an `a76-`
prefix and deletes them all, and there are **zero** of them left. The write gate
cleaned up after itself exactly as it claims to.

They are the PO's own data, so this session did not delete them. **They are also
the perfect first demonstration of point 8's delete button**, and that is what
they are being kept for.

---

## 14. POINT 0 — THE NATIONAL BASEMAP. CUT, MEASURED, GATED. ⛔ THE UPLOAD IS BLOCKED ON THE PO

**THE ARCHIVE EXISTS AND IT IS GOOD.** What is NOT done is putting it in the
bucket, and the reason is not technical timidity — it is the security decision
this project made on purpose and P3.1 finished enforcing. Read §14.4 before
doing anything else with this unit.

### 14.1 · The dry run said 94 MB, so there was nothing to escalate

The product owner's instruction was: *if the dry run passes ~250 MB, stop and
put the costed options to me.* It does not.

| bbox | area | z0–z14 | verdict |
|---|---|---|---|
| the old southern one — `34.27,30.69,35.60,32.23` | 2.05 deg² | 42 MB | superseded |
| **ALL ISRAEL — `34.20,29.35,36.00,33.45`** | **7.38 deg²** | **94 MB** | ✅ cut |

★ **3.6× THE AREA FOR 2.2× THE BYTES, and the reason is worth keeping**: the
  added ground is the Mediterranean, the Negev's empty south and the Arava.
  Vector tiles cost what is ON them, so an empty tile is nearly free — which is
  why "the whole country" turned out to be a smaller decision than it sounds.

**The bbox reaches past every border the programme could plausibly grow into**:
Metula in the north (33.279), Eilat in the south (29.558), the Golan and the
Jordan valley in the east (35.9), the coast in the west. Yehuda-Shomron is
inside it in full.

**94 MB is under both ceilings that matter** — the PO's authorised 200 MB, which
is a COLUMN (`storage.buckets.file_size_limit = 209715200`) and not a memory —
and the 1 GB free tier. It is OVER Supabase's 50 MB standard-upload cap, so the
upload is a **resumable (TUS)** one, which is why §14.3 is a script and not a
`curl`.

Source `https://build.protomaps.com/20260831.pmtiles`, OSM data of
**2026-08-31 04:00 UTC**. Local file, git-ignored on purpose (a 94 MB blob does
not belong in a public repository with a 100 MB cap):

`basemap/israel-20260831-z14.pmtiles` — **94 268 129 bytes**

### 14.2 · Health-checked before anything else, and on SEVEN cities not one

Header: spec **v3**, tile type **mvt**, bounds exactly the bbox, **min zoom 0 /
max zoom 14**, `clustered: true`, attribution present, planetiler 0.10.2.

★ **AND THEN A REAL z14 TILE AT EACH END OF THE COUNTRY, decoded rather than
  counted.** A header can be right over empty ground; this is what says the
  ground is there:

| place | z14 tile | decompressed | layers |
|---|---|---|---|
| באר שבע | `14/9775/6693` | 81 KB | buildings earth landuse places pois **roads** water |
| חיפה | `14/9784/6610` | 77 KB | buildings earth landuse places pois **roads** water |
| ירושלים | `14/9794/6665` | — | present |
| שכם (Yehuda-Shomron) | `14/9796/6641` | 38 KB | + **boundaries** |
| תל אביב | `14/9774/6648` | — | present |
| מטולה (northern tip) | `14/9811/6584` | — | present |
| אילת (southern tip) | `14/9782/6782` | — | present |

### 14.3 · `bun run basemap` — the replacement procedure, as a script

`scripts/basemap.ts`, wired as `bun run basemap <file> <key>`.

★ **IT VERIFIES THE PUBLIC OBJECT AFTERWARDS, AND THAT IS THE HALF THAT
  MATTERS.** A TUS upload that answers 204 on every chunk and serves a
  truncated file is the failure mode a `curl` cannot see. So after the last
  PATCH it checks: the public URL answers 200, `content-length` equals the
  local file BYTE FOR BYTE, `accept-ranges: bytes`, a range request comes back
  **206**, the first seven bytes read `PMTiles`, and — the one that catches a
  corrupted chunk — **a 64 kB slice from the MIDDLE of the object is compared
  byte for byte against the same slice of the local file**.

### 14.4 ⛔ WHY THE UPLOAD DID NOT HAPPEN, AND THE ONE THING THE PO MUST DO

**Writes to the `basemap` bucket are coordinator-only** — that is
`20260831000300_basemap_bucket.sql`, and it is the policy that let the FIRST
upload happen through a normal signed-in session and **without the service-role
key this project never fetches**. The session it used belonged to
`dov+test@serialkolors.com`.

★ **P3.1 DELETED THAT ACCOUNT THIS MORNING. THERE IS NO LONGER A NON-HUMAN WAY
  INTO STORAGE, WHICH IS EXACTLY WHAT P3.1 WAS FOR.** The only coordinator left
  is `dov@serialkolors.com`, whose password only the product owner has ever
  typed — decision 70, and it is not being revisited.

⚠️ **A TEMPORARY ANONYMOUS-WRITE POLICY WAS CONSIDERED AND IS RECORDED HERE SO
  IT IS NOT QUIETLY RE-INVENTED.** The shape was narrow — `for insert to anon`,
  one bucket, the one exact object name, dropped minutes later. It was
  **refused by this session's own safety classifier**, and on reflection that
  is the right answer rather than an obstacle: an hour after closing the second
  door onto the programme's storage, re-opening it under a different name is
  the same act with better paperwork. It is not attempted again.

**SO ONE OF THESE TWO, AND EITHER IS A MINUTE'S WORK:**

1. ⛔ **THE PRODUCT OWNER, IN THE DASHBOARD** — Storage → `basemap` → Upload
   file → `basemap/israel-20260831-z14.pmtiles` from this repository. The
   dashboard uploads resumably, so 94 MB is fine. **The key must be exactly
   `israel-20260831-z14.pmtiles`** — the app is pointed at a name, and the OSM
   build date is IN the name so a replacement is a new URL rather than an
   overwrite (the free tier serves `cache-control: no-cache` whatever is stored
   on the object, measured 2026-08-31, so the versioned name is what lets the
   service worker hold one archive indefinitely).
2. Or he signs in and hands over a coordinator access token for one run:
   `BASEMAP_TOKEN=… bun run basemap basemap/israel-20260831-z14.pmtiles israel-20260831-z14.pmtiles`

**AND THEN IT IS ONE LINE AND THREE GATES**, which is why nothing else was
changed in the app: `BASEMAP_KEY` in `src/ui/components/basemap.ts:315`
becomes `'israel-20260831-z14.pmtiles'`, then `bun run offline`, `bun run
mapfirst`, `bun run touch`. **The key is deliberately still the Negev one** —
flipping it before the object exists would take the map off the deployed app
the night before the PO shows it to his team.

### 14.5 ★ THE B3 REPLAY IS ALREADY WRITTEN, AND IT ALREADY PROVES THE COMPLAINT

`bun run offline` grew the two-city check the PO asked for, and it is not a
formality — it flies the real map to each city, waits for `idle`, and counts
**rendered features from the `roads` layer**, because `isStyleLoaded()` is
cheerfully true over blank ground.

Run tonight against the archive that is IN the bucket today:

```
PASS  ★ and the ground is really there at באר שבע (Beer Sheva), offline
      — 1575 features rendered, 981 of them roads
FAIL  ★ and the ground is really there at חיפה (Haifa), offline
      — 0 features rendered, 0 of them roads
```

★ **THAT FAILING LINE IS THE PRODUCT OWNER'S POINT 0, MEASURED.** It is the
  first thing that will go green when the national archive lands, and until it
  does, `bun run offline` is **20/21 with one KNOWN failure** — Haifa, and
  nothing else. Do not silence it.

---


---

## 15. POINT 1 — THE INSTALLED iPAD'S INSETS. ONE FIX, ONE ARBITRATION, ONE INSTRUMENT

The product owner installed the PWA cleanly on a real iPad Pro 13" and got:
a solid band at the top with the content not reaching under the system bar, no
gradient, the same in both themes — and a small residual band at the foot.
**Four separate things, and they have three different causes.** All four are
answered below; one of them is his to decide.

### 15.1 · `viewport-fit=cover` — checked on the ARTEFACT, and it is not the cause

Fetched from `https://azmer-fts.github.io/lo-yanum/` rather than read off the
tree: `<meta name="viewport" content="width=device-width, initial-scale=1.0,
viewport-fit=cover">` **is served**. So is `apple-mobile-web-app-capable`.
`apple-mobile-web-app-status-bar-style` is **absent**, which is §12bis.7's
deliberate choice and, it turns out, the cause of three of the four symptoms.

### 15.2 ★ THE CAUSE OF THE TOP THREE, AND IT IS ONE FACT ABOUT iOS

**Without `apple-mobile-web-app-status-bar-style: black-translucent`, iOS lays
an installed web app BELOW the status bar.** There is then no unsafe area at
the top — iOS already inset the whole web view — so
**`env(safe-area-inset-top)` is `0`**.

Everything follows from that single zero:

| what he saw | why |
|---|---|
| the content does not extend under the bar | iOS put the view below it. By design, without the tag. |
| **no gradient at all** | `body::before` is `height: calc(var(--status-inset) * 1.25)`. `--status-inset` is `env(safe-area-inset-top)`. **Zero × 1.25 = zero.** The rule is correct and had nothing to draw. |
| the band is identical in light and dark | those pixels are painted by **iOS**, not by the app, from `theme-color` — which iOS reads AT LAUNCH. `theme.tsx` keeps that tag in step with the palette at RUNTIME, far too late for a home-screen app, so what showed was the boot literal `#0B1119` in both themes. |

★ **AND IT EXPLAINS WHY EVERY GATE WAS GREEN.** `STANDALONE=1` STAMPS
  `--status-inset` with a real device's number, because Playwright can emulate
  a viewport and will never emulate a notch. That simulation was always honest
  about being one — and what it simulates turns out to be **option B's**
  geometry, the configuration this app does not ship. The gate was measuring a
  layout nobody runs.

### 15.3 · WHAT WAS FIXED WITHOUT ASKING: the status bar now follows the scheme

`index.html` carries three `theme-color` tags instead of one:

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F3F4F6" />
<meta name="theme-color" media="(prefers-color-scheme: dark)"  content="#0B1119" />
<meta name="theme-color" content="#0B1119" />
```

★ **THE ORDER IS THE WHOLE MECHANISM.** A browser takes the FIRST
  `theme-color` whose `media` matches, and an unscoped tag matches everything —
  so an unscoped tag placed first would shadow both media tags permanently. Last,
  it is the fallback, and `theme.tsx` now selects
  `meta[name="theme-color"]:not([media])` so a live theme change cannot
  overwrite the two above it.

⚠️ **Its limit, stated rather than glossed:** it follows the SYSTEM scheme, not
the app's own choice. A coordinator who forces dark on a light iPad gets a
light status bar. That is the ceiling of what meta tags can express, it is
strictly better than one wrong colour in both directions, and the way past it
is the arbitration below.

### 15.4 ⚖️ THE ARBITRATION — ONE COMMENTED LINE IN `index.html`

**OPTION A — what ships today.** The app sits below an opaque system bar. The
bar now takes the right colour per scheme (15.3). The content does not reach
the top of the display and there is no gradient, because with an opaque bar
there is nothing for a gradient to protect.

**OPTION B — `apple-mobile-web-app-status-bar-style: black-translucent`.** The
app fills the screen, `env(safe-area-inset-top)` becomes real, the content runs
under the bar and the gradient appears and follows the theme — **everything he
asked for at the top.** The price is fixed and CSS gets no say in it: **iOS
forces the clock, the battery and the signal bars to WHITE, permanently, in
both themes.** Against the light theme's `#F3F4F6` that is white on near-white,
so option B also switches the gradient to a **dark scrim in both themes**
(`index.css`, `html[data-statusbar='translucent']`).

★ **SO THE REAL QUESTION IS ONE SENTENCE:** *is an edge-to-edge app worth a
  permanent dark strip across the top of the light theme?* That is the whole
  trade, it cannot be tuned away, and it is his call and not this session's.

**It is BUILT, not described.** `standalone.ts` reads the meta tag and stamps
`data-statusbar='translucent'`; the scrim rule keys off that. Uncommenting one
line in `index.html` switches the whole app. And the gate can stamp the same
attribute, so the captures are of the real rule:

`docs/screenshots/statusbar/` — `ipad-{light,dark}-ios.png` (option A) and
`ipad-{light,dark}-translucent.png` (option B), plus `ipad-ls-*`. ★ The mock
clock in the option-B captures is drawn **white in BOTH themes**, because that
is what iOS will do; a capture that drew a flattering dark clock on the light
theme would have hidden the entire cost being arbitrated.

### 15.5 ★ THE BAND AT THE FOOT WAS A REAL BUG, AND PO RETURN 6 HAD FIXED ONLY HALF OF IT

`--shell-bottom` answered two different questions with one number:

· **how many pixels at the bottom are physically occupied** — what a
  full-`dvh` column must subtract;
· **how far up a floating control must start** — which, with nothing pinned
  down there, is the iOS home indicator.

Return 6 replaced a hard-coded `2.75rem` with `var(--safe-bottom)`. Right for
the second question, **wrong for the first — and eleven of the twelve call
sites were asking the first.** So on the iPad every `100dvh` map column stopped
~20 px above the display and painted the shell's own `--surface-base` in the
gap. **The residual band.** It reserved space for a home indicator that needs
none: the indicator is a translucent pill drawn OVER the app, and iOS's own
convention is that content runs under it.

Two tokens now, and the split is the fix:

```css
--shell-foot: 0px;                                        /* what is OCCUPIED */
--shell-bottom: max(var(--shell-foot), var(--safe-bottom)); /* what a CONTROL clears */
```

`max()` and not a sum: the demo bar already paints under the indicator with its
own `pb-[var(--safe-bottom)]`, so adding the two would push every sticky footer
20 px off the bar it is sitting on. Column sites moved to `--shell-foot`;
`CreateGuardFab` and the two sticky form footers keep `--shell-bottom`. The
desktop rail takes `--shell-foot` for its HEIGHT and `--safe-bottom` as
PADDING, so its surface reaches the display edge while the account block at its
foot stays out of the indicator's strip.

### 15.6 ★★ AND THE GATE FOUND A SECOND, UNRELATED DEFECT THE MOMENT IT COULD SEE

`bun run layout STANDALONE=…` now asserts a foot-band invariant:
**`--shell-foot` must equal what is really occupied at the bottom of the
viewport.** It failed on the first run — on all seven FIELD screens:

```
PO POINT 1 band at the foot: --shell-foot claims 69px,
                             div.sticky.bottom-0.z-30 occupies 131.09px
```

★ `DevToolbar` published ITS OWN height, which was right for as long as it was
  the only thing down there. In `FieldLayout` it is not — **the tab bar and the
  toolbar share ONE sticky container** — so the shell claimed 69 px while
  131 px was taken and **62 px of every full-`dvh` column sat behind the tab
  bar** on the farmer's, the volunteer's and the driver's screens. Nobody had
  reported it. The CONTAINER measures itself now, so whatever it comes to hold
  is included by construction.

**And a second assertion catches the ORIGINAL bug, which the first one cannot:**
the sweep runs in DEMO mode, where the bar really is pinned and the claim and
the occupant agree. So the audit also drops the inline override for one frame
and reads **the TOKEN DEFAULT** — precisely what a real build computes, without
building one — and requires it to be **zero**. That value was `2.75rem`, then
`var(--safe-bottom)`; it is the defect itself, and it is now a failing line.

### 15.7 · `STANDALONE=ios` — the configuration he actually runs

`bun run layout` gained a second installed mode. `STANDALONE=1` stamps the
device's real top inset (option B's geometry). **`STANDALONE=ios` stamps
`data-standalone` with a top inset of ZERO and the home-indicator inset
unchanged** — option A, which is what ships, and which is the layout on his
iPad this morning. The bottom inset is deliberately not zeroed: the status-bar
tag has nothing to do with the home indicator, iOS reports that one either way,
and it is the half that produced the band.

### 15.8 · THE INSTRUMENT — אבחון תצוגה, in הגדרות, and removable in one move

`src/ui/components/DisplayDiagnostics.tsx`, a collapsed `<details>` at the foot
of הגדרות. It reports, on his device: the four `env(safe-area-inset-*)` values,
the five tokens derived from them, the gradient's computed height, whether
there is a gradient at all, `navigator.standalone`, `display-mode`,
`data-standalone`, `data-theme`, `prefers-color-scheme`, and the **viewport,
status-bar-style and theme-color meta tags as served** — plus a copy button, so
twenty rows come back as text rather than as a photograph of a screen.

★ **IT READS `env()` DIRECTLY, THROUGH A PROBE ELEMENT, NOT THE TOKENS.** The
  tokens are what the app consumes and they can be overridden — by the gate, by
  a future rule — so a panel that reported the tokens would faithfully report
  the SIMULATION and prove nothing. Both are shown side by side, and a
  disagreement between them IS the finding.

**To remove it: delete the file and the two lines in `SettingsScreen.tsx` that
render it.** Nothing else imports it.

---

## 16. POINTS 2 AND 9 — THE PARASITIC SCROLL IS FOUND, AND THE PENCIL IS GATED

### 16.1 ★★ POINT 2 — OPEN QUESTION 7bis IS CLOSED, AND THE CAUSE IS ONE NUMBER

**`.input` was `text-caption` — 13.5 px — and iOS ZOOMS THE WHOLE PAGE when a
focused field's font is under 16 px.**

Not the field. **The page.** Every WebKit on iOS does it, Safari and installed
PWA alike, and there is no way to opt a field out of it except by giving it
16 px. `--text-caption-size` is `0.84375rem`, so the coordinator's first tap on
"שם החווה" scaled the document by 16 / 13.5 ≈ **1.19**. A document 19 % wider
than the visual viewport pans in BOTH axes under a finger.

★ **THAT IS THE WHOLE SYMPTOM, FROM ONE CAUSE.** "The page moves left-right AND
  up-down" — both. "On the farm form" — and on every screen with a field, which
  is why it looked like a form bug. "Installed, on the iPad" — because no
  desktop browser does this. Open since §12bis.5 and unreproducible in three
  sessions of looking, because the instrument was always a desktop engine.

**The fix, and it costs nothing in legibility:**

```css
@media (pointer: coarse) {
  input:not([type='checkbox']):not([type='radio']):not([type='hidden']),
  select, textarea { font-size: 1rem !important; -webkit-text-size-adjust: 100%; }
}
```

★ **iOS WAS ALREADY RENDERING THESE FIELDS AT ~16 px** — it just got there by
  scaling the entire document. Declaring 16 px gives the same apparent size
  with the page standing still. Coarse pointers only, so P0bis.3's desktop
  density survives untouched.

★ **`!important`, AND IT IS THE ONLY ONE IN `index.css`.** The fields carry
  Tailwind's `text-caption`, which is a CLASS and beats any element selector
  however it is written; raising specificity by hand still loses, and moving
  between layers would make a device bug depend on Tailwind's internal sort
  order. This is a hard device constraint, not a style preference: below 16 px
  iOS takes the page away from the user.

### 16.2 ★ AND THE GATE THAT MAKES IT PERMANENT, PLUS THE ONE THAT COULD NOT

**`ENGINE=webkit bun run layout` runs the whole sweep in Safari's engine.** It
was the right thing to try — the product owner's every browser is WebKit — and
Playwright's WebKit build was already on this machine. It reported a perfectly
still page.

★ **BECAUSE THE ZOOM IS AN iOS BEHAVIOUR, NOT A WEBKIT-THE-ENGINE BEHAVIOUR.**
  Desktop WebKit does not do it. **The symptom is unreachable from here; the
  CONDITION is exact.** So the sweep asserts the condition: **no focusable form
  control may compute under 16 px**, on every touch viewport, on every screen.
  On its first run it failed on **twenty-three of the thirty-two screens** and
  named the control each time. WebKit stays in the gate regardless — it is a
  second engine over the whole app and it costs one env var.

★ **AND ALL FOUR VIEWPORTS NOW RUN WITH `hasTouch: true`**, which they should
  always have done: two iPhones and an iPad in both orientations are touch
  devices, and `(pointer: coarse)` had never matched, so a rule written FOR
  those devices was invisible to the gate that covers them.

### 16.3 · THE FORM SCREENS JOINED THE PERMANENT SWEEP — including the ones that are not URLs

The product owner asked for the form screens on the four viewports. Half of
them are not routes, so a route may now carry an `open(page)` step that puts
the app in the state it means. **A setup step that throws FAILS the screen
rather than skipping it** — a sweep that quietly stops covering the volunteer
form the day its button is renamed is worse than no coverage, because the run
still says PASS.

`ROUTES` went from 24 to 32: `farm-form-new`, `anchor-form`, `anchor-form-new`,
`volunteer-modal`, `driver-modal`, `wizard-step-2`, `wizard-step-3`,
`wizard-step-4`.

★ **STEPS 2–4 WITHOUT DRIVING THE MAP, and the shortcut is the app's own rather
  than a test-only door**: `?resume=<missionId>` is what "המשך גיוס" links to
  on a mission detail, and it lands the wizard on step 2 with a real mission's
  farm, window, shortlist, responses and drivers already in it. From there
  `הבא` is simply enabled. `bun run wizard` still plays step 1 by hand — that
  gate is about the scoring, this one about the geometry.

Three `data-testid`s were added for it (`volunteer-new`, `driver-edit`,
`wizard-next`) and `Modal` gained `data-overlay`, because a modal covering the
shell is the POINT of a modal and the sweep's "no pinned element covers
another" rule had to be told which overlap is deliberate.

⚠️ **THE VERTICAL HALF IS POINT 4 AND IS NOT CLOSED HERE.** The 1.19× zoom
explains the up-down movement he saw *on the form*; the rubber-band overscroll
of the whole shell is a separate thing and is point 4's unit.

### 16.4 ★ POINT 9 — THE APPLE PENCIL, AUDITED THEN GATED

**The audit first, because it decides what the gate has to prove.** Every map
interaction in this app goes through MapLibre's own event system (`click`,
`contextmenu`, `dblclick`, and `Marker({draggable})`) or through the splitter,
which has used **Pointer Events since it was written**. On iOS an Apple Pencil
produces `touch` events AND `PointerEvent`s with `pointerType: 'pen'`, so
MapLibre's handlers see it. Nothing in this app branches on `pointerType` and
nothing depends on a finger-only gesture.

★ **AND THE ONE THING THAT COULD HAVE BEEN A WALL IS NOT ONE: NO INTERACTION
  IS REACHABLE ONLY BY DOUBLE-TAP.** Closing a drawn ring has **"סגור פוליגון"**
  beside the double-tap shortcut (`AnchorMap.tsx`); the seam's double-tap reset
  has **Enter and Space**; placing a point is a single tap on an armed map. The
  double-taps are shortcuts for a thumb, never the only door.

**`bun run touch` grew section 10 — the same vocabulary, with a stylus.**
`Input.dispatchMouseEvent` takes a `pointerType`, so the gate dispatches real
`PointerEvent`s with `pointerType: 'pen'`. **32 checks → 45, all green:**

| with a stylus | result |
|---|---|
| ★ the page really receives `pointerType="pen"` | PASS — `pen` |
| a stylus tap places a guard post | PASS — 1 → 2 |
| a stylus stroke drags it | PASS — Δ 90, −68 |
| four stylus taps are four corners | PASS — `4 פינות` |
| ★ **"סגור פוליגון" closes the ring — no double-tap required** | PASS |
| a vertex follows the stylus | PASS — Δ −70, 55 |
| a stylus tap on a midpoint grip inserts a corner | PASS — 5 → 6 |

⚠️ **WHAT A GREEN RUN DOES NOT SAY, so nobody reads more into it:** iOS's own
gesture layer is not simulated. A Pencil on glass has tilt, pressure and hover
that no protocol reproduces, and a stylus does not raise the long-press callout
a finger raises. The audit above is what covers that half; the gate covers
"does the interaction respond to a pointer that is not a finger", which is the
question that decides whether he can work.

★ **SCRIBBLE IS SAFE TODAY AND IS A CONSTRAINT ON POINT 4.** `touch-action:
  none` appears in exactly one place in this codebase — the splitter's grip,
  where it is load-bearing — and on no field anywhere. **Point 4 must not put
  `touch-action: none` or a blanket `preventDefault` on a text input**, or
  handwriting into a field stops working on the one device this app is for.

---

## ⏭️ RESUME HERE — THE PRODUCT OWNER'S SECOND RETURN, IN HIS ORDER

> ✅ **PMTILES IS DONE AND DEPLOYED (§12ter), and verified on the artefact
> rather than on the tree** — signed in on the live app, 2026-08-31: the map's
> source is `pmtiles://…/basemap/negev-20260829-z14.pmtiles`, **23 responses,
> every one a 206**, the style's background is `rgb(243 244 246)` — which is
> `--surface-base` and therefore proof the tokens really drove it — and
> `canvasFilter` is `none`, so the `hue-rotate` is gone from what ships. The
> deployed stylesheet contains `--map-filter` **zero** times; the vendored
> glyphs, sprites and RTL plugin all serve 200. **The frozen `/poc` still draws
> `type: "raster"` from an `osm` source and contains `pmtiles` zero times** —
> it is never rebuilt, and it is the one place OSM tiles legitimately survive.
>
> **The PMTiles brief further down is KEPT AS WRITTEN, with its two stale
> points corrected in place and marked DELIVERED**, because §12ter refers back
> to it and because the reasoning about approvals and about the raster surface
> is the reasoning that will be asked about again. **It is not the next unit.
> The next unit is immediately below.**

### ✅ P3.1's IRREVERSIBLE ACT IS DONE — SEE §13, AND DO NOT RE-OPEN IT

The three steps are complete and verified (§13). **`bun run write` failing at
its first check and `bun run offline` reporting 19/19 with one SKIP are now the
GREEN results for those two gates.** Anybody who "fixes" either of them has
re-created the second door onto real farmers' phone numbers that §13 closed.

### 📋 THE ORDER OF MARCH THE PRODUCT OWNER GAVE ON 2026-08-31 (SECOND RETURN)

**He presents the app TO THE ASSOCIATION'S TEAM TOMORROW.** That is the deadline
every item below is sized against, and it is why the order is his and not the
lot plan's. Eleven points, then the rest of P3:

| # | in one line | state |
|---|---|---|
| **P3.1 fin** | delete the test account, all three steps | ✅ **DONE — §13** |
| **0** | offline basemap: **ALL ISRAEL**, not the southern bbox | 🟡 **cut, health-checked, gated — ⛔ THE UPLOAD NEEDS THE PO, §14.4** |
| **1** | installed-iPad bug: the safe-area insets do not apply IN REAL | ✅ **§15** — cause found, foot band fixed (+ a second defect the new gate caught), instrument shipped; ⚖️ **ONE ARBITRATION FOR THE PO** |
| **2** | reproduced bug: parasitic scroll on the farm form, both axes | ✅ **§16.1–16.3** — cause found (iOS zooms the page under 16 px), fixed, gated on 32 screens × 4 viewports × 2 engines |
| **9** | **Apple Pencil** on every map interaction — he draws with a stylus | ✅ **§16.4** — audited, and `bun run touch` is 45 checks with a `pointerType=pen` pass |
| **8** | **delete** a record — there is no way to correct a typo today | ⬜ |
| **6** | **livestock** head-count per entity — funding depends on it | ⬜ |
| **7** | **the employer's PDF report**, sendable in one gesture | ⬜ |
| **3** | the network-state pill on every screen | ⬜ |
| **4** | clean pull-to-refresh, native overscroll off | ⬜ |
| **5** | a pass over the empty states | ⬜ |
| **then** | photos → signature (finger AND stylus) → P3.3bis automatic email → the final PWA → deployment → the French report | ⬜ |

**The acceptance rule he set, and it is the one that governs all eleven:** every
point lands **by a gate or by a capture**. Point 2 EXTENDS a permanent gate.
Point 1 delivers either a fix or an arbitration WITH captures. Point 0 replays
B3 on two cities far apart. Point 7c PROVES the PDF and the dashboard cannot
disagree. Point 9 is verified at `pointerType=pen` on drawing, on vertex
editing, on a pin AND on the signature.

### THEN P3, IN THE WRITTEN ORDER OF MARCH

P3.1 the real import → photos → signature → P3.3bis the automatic email → the
final PWA pass → deployment. `src/core/import.ts` was written to be re-runnable
server-side unchanged, and `bun run import` (29 checks) already drives
download → fill → upload → find against the templates, so P3.1 is a data
question rather than a code question.

⚠️ **AND THE ONE THING TO CARRY IN FROM THIS SESSION:** the horizontal-scroll
symptom of §12bis.5 was never reproduced (open question 7bis). If it returns,
the four facts worth writing down are the SCREEN, the WINDOW WIDTH, browser tab
vs installed, and whether the rail was expanded.

> **The product owner's returns of 2026-08-31 are delivered (§12bis) and did
> not change this unit.** All seven are delivered and gated (§12bis); none of them
> touched the map's tile source, which is what this unit is about. The one
> thing to carry in: **§12bis.5's horizontal-scroll symptom was never
> reproduced** (open question 7bis) — if it turns up again it will most likely
> turn up on a map screen, so it is worth watching for while MapCanvas is being
> rebuilt here.

> ✅ **DELIVERED 2026-08-31 — everything from here to the end of this section
> is the historical brief, kept for its reasoning. See §12ter for what was
> actually built and what the brief got wrong.**

**THE UNIT IN ONE SENTENCE:** replace the OSM raster basemap with one
self-hosted Protomaps PMTiles file of southern Israel, served from a PUBLIC
Supabase Storage bucket, styled as vector in the app's own colours in BOTH
themes, and downloadable in full behind the "רענן מפות לא מקוונות" button.

**IT CLOSES THREE THINGS AT ONCE, which is why it is worth its size:**
· criterion B3 revised — a basemap that is usable offline after ONE download
  rather than four thousand requests OSM's policy forbids (decision 71);
· standing carry-in item 2, open since Lot 0.9 — the map can finally be
  themed in the charter's greens instead of approximated with a CSS
  `hue-rotate` on a raster;
· open question 9 — the violet Mediterranean, which is a symptom of that same
  `hue-rotate` and disappears with it.

**THE ORDER TO DO IT IN, and the two places it will stop and need the PO:**

1. **THE EXTRACT.** `pmtiles extract` (the Protomaps Go CLI) pulls only the
   byte ranges it needs out of a public daily planet build, so the bbox comes
   down in the tens-to-low-hundreds of MB rather than the planet's 100 GB.
   bbox: the gazetteer's own, padded — **34.27→35.60 E, 30.69→32.23 N**.
   ⚠️ **APPROVAL 1: this needs the `pmtiles` executable on the machine.** The
   session's classifier refuses unattended downloads of executables, and it is
   right to. Ask before starting the unit, not halfway through it.
   ✅ **CHECKED 2026-08-31 — IT IS IN HOMEBREW, so there is no raw GitHub
   release download to argue about.** `brew info pmtiles` → **stable 1.31.2,
   bottled, homebrew-core, BSD-3-Clause**, and Homebrew is already how `bun`
   got onto this machine (`/usr/local/bin`, Intel prefix). `brew install
   pmtiles` is the form to ask for.
   Sanity-check the result before uploading anything: open it, confirm the
   zoom range covers z6–z14 (z14 is where a farm track is legible and where
   the raster estimate topped out at 51 MB), and confirm the size.
2. **THE BUCKET.** A PUBLIC Storage bucket, and it is the first public thing
   in this project — say so in its migration next to the two private ones
   from P2.4, because "why is this one public" is the question a reviewer will
   ask and the answer is "it is a map of Israel, it contains nothing about
   anybody". PMTiles reads it with HTTP **range requests**, so the bucket must
   answer `206`; check that before writing any client code.
   ⚠️ **APPROVAL 2: the upload.** Free tier is 1 GB stored / 5 GB egress and
   the standard upload caps at 50 MB — over that it is a resumable (TUS)
   upload. Cost stays 0.
3. **THE STYLE.** ⚠️ **CORRECTION 2026-08-31 — THIS BRIEF WAS WRONG AND A
   FRESH SESSION WOULD HAVE BELIEVED IT.** Only `maplibre-gl` is in
   `package.json`; **`pmtiles` is NOT a dependency and is not in `bun.lock`**
   (checked: `ls node_modules | grep pmtiles` is empty, `grep -c pmtiles
   bun.lock` is 0). The unit therefore adds TWO ordinary npm dependencies —
   `pmtiles` (the JS protocol adapter MapLibre needs to read an archive over
   range requests, which is a different thing from the Go CLI in step 1) and
   `protomaps-themes-base`. Neither is an executable download.
   `protomaps-themes-base` is the shortest path to a correct vector style, but
   the COLOURS must come from `src/styles/tokens.css` and not from its
   presets — one style function, two palettes, the same tokens the rest of the
   app is contrast-audited against. Run `bun run contrast` on whatever is
   added.
4. **THE SWAP.** `src/ui/components/MapCanvas.tsx` is the only file that
   should need to change **for the style itself** — the surface is small and
   exact: `OSM_STYLE` (one `const`, `src/ui/components/MapCanvas.tsx:23`) and
   the single `style: OSM_STYLE` that consumes it. But the RASTER assumption
   leaks into three more places that have to move with it, mapped 2026-08-31 so
   the next session does not discover them one failing gate at a time:
   · `public/sw.js` — `TILE_HOSTS = ['tile.openstreetmap.org']` and
     `TILE_CACHE`. One archive read by range requests is not "many small
     tiles", and step 5 already says it wants its own cache name.
   · `scripts/offline.ts` — `TILE` is a hard-coded
     `https://tile.openstreetmap.org/10/609/418.png`, asserted twice.
   · `src/index.css:828` + `tokens.css` (three `--map-filter` declarations) —
     the `hue-rotate` of step 6. ★ **AND IT IS THE RISK OF THE WHOLE UNIT:** the map
   is on 27 screens, and `mapfirst` (27), `splitter` (72) and `touch` (32) all
   drive it. Run those three FIRST, before anything else, on every change.
5. **THE BUTTON.** In הגדרות, next to P2.5a's tile-cache report. It must show
   THE SIZE BEFORE THE TAP — a coordinator on cellular data has to be able to
   decline — then a real progress indicator, then the held state. The service
   worker already has the caching machinery; what is new is one big file
   rather than many small ones, so it wants its own cache name and its own
   "drop it" button.
6. **DELETE THE `hue-rotate`.** It is the point of the exercise. `bun run
   offline`'s tile assertions and `docs/brand-artzenu.md` §3 both talk about
   it and both need rewriting when it goes.

**AND THE GATE:** extend `bun run offline` (it already builds and serves a real
build) rather than writing a tenth browser script — the claim is "the basemap
is there with no network", which is the same claim A72 already makes about the
shell.

Then **P3**, in the written order of march: P3.1 real import, photos,
signature, P3.3bis automatic email, the final PWA, deployment.

⚠️ **AND P3.1 IS THE DEADLINE ON THE TEST ACCOUNT** — see the reminder at the
top of this file. Delete `dov+test@serialkolors.com`, its `app_users` row and
`.env.test` BEFORE importing a single real farmer, and confirm it in that
session's report.


Then P2 (Lot 1) and P3 (Lot 2 essential) per the final order of march recorded
at the top of this file.

**Both P2 blockers are ANSWERED (product owner, 2026-08-30):**

1. **`lo-yanum-prod` EXISTS.** Created 2026-08-30 in the PO's only Supabase
   organisation (`Azmer-FTS`, id `jkqsqykhquutilldvcsv`), region
   **eu-central-1** (Frankfurt), free tier, cost confirmed at **0/month**.
   · project ref: **`lvrptqmkjikkkhcxocbe`**
   · API URL: `https://lvrptqmkjikkkhcxocbe.supabase.co`
   · publishable key: `sb_publishable_4phO_2UMuhWGKCC8uugRmQ_P_IQqAf_`
     (a legacy JWT `anon` key exists too; prefer the publishable one — it
     rotates independently)
   · status: ACTIVE_HEALTHY. **P2.2 IS APPLIED** — schema + RLS are live and
     the database is deliberately EMPTY (P2.6: the real app starts with
     nothing; /poc keeps the demo data).

   **The publishable key is PUBLIC BY DESIGN and belongs in the bundle.** That
   is not a compromise, it is how Supabase works: the key identifies the
   project, it does not authorise anything. **THE SECURITY IS THE RLS**, which
   is why P2.2 transcribes `access.ts` policy by policy and why B1's proof is
   an anonymous read being REFUSED. It goes in `.env` locally and in a GitHub
   Actions secret for the build; both are read through `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_PUBLISHABLE_KEY`.

   **The service-role key is never fetched, never committed and never reaches
   the client.** If any future step seems to need it in the browser, that step
   is wrong.
2. **The coordinator account is `dov@serialkolors.com`.** One account in
   phase 1. **Never set the password**: it is created by the PO himself in
   Supabase's own dashboard (Authentication → Users → Add user → Create new
   user, Auto Confirm User ticked) and he is the only person who has ever
   typed it. No credential is ever typed into this app, committed, or given to
   an agent — and no verification gate needs one. The account is only half the
   grant: `app_users` is where a login becomes a coordinator, and that half is
   `20260830000400_coordinator_grant.sql`.

Also carry in: the anon key is PUBLIC by design and **the security IS the
RLS** — that is why P2.2 transcribes `access.ts` policy by policy and why a
refused anonymous read is criterion B1. Moving to a private repo +
Cloudflare Pages is a later improvement, explicitly NOT now.

**Lot 1 — Supabase, the transcription notes.** Translate `src/core/access.ts`
into RLS policies one
function at a time; the bodies are written to make that a direct transcription.
`src/core/import.ts` is written to be re-runnable server-side unchanged,
`src/core/dispatch.ts` is a candidate for a Postgres function verbatim, and
`photo: string | null` becomes a Storage object key.

Do **not** add Supabase, auth or offline sync before Lot 1 is explicitly begun.

Three items to carry in:

1. **Settle open question 8 (font licences)** before any real user sees the app.
2. **Move off OSM raster tiles to a keyed vector provider.** A vector style can
   be themed in the charter's greens directly instead of being approximated with
   a CSS `hue-rotate` on a raster — and Lot 0.9 raised the stakes: the maps are
   now the primary input on three screens, not decoration.
3. **`additionalAnchorPointIds` becomes a JOIN TABLE, and it is no longer a
   judgement call.** Decision 56 settled it: each additional position may carry
   an optional time window, which an array column cannot hold. Shape:
   `mission_anchor_points (mission_id, anchor_point_id, position, starts_at
   NULL, ends_at NULL)`. `anchorPointId` stays a plain FK on `missions` — see
   decision 52. The UI for the windows is Lot 1 work; nothing in the mock store
   should grow a half-guessed version of it before then.
