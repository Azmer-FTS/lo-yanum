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

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on :5173 (honours `PORT` so a second one can run alongside) |
| `bun run build` | Typecheck + production build to `dist/` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run contrast` | WCAG audit of the design tokens (A13/A19) — 133 pairs, fails the build on a regression |
| `bun run tokens` | **A28/A29** — one radius scale, no tinted field, orange only where it is allowed. No browser needed |
| `bun run dispatch` | Guard-scoring verification (A21) — 27 checks, no browser needed |
| `bun run accept` | Acceptance criteria driven through `@core` (A4–A23) — 64 checks |
| `bun run layout` | **A24 + A30** — 390 px overflow, pinned overlap and uncontained-list sweep over all 23 screens — needs a dev server |
| `bun run wizard` | **A27** — the guard wizard played from a farm with NO anchor point, 28 checks — needs a dev server |
| `bun run touch` | **A63** — every map gesture driven by SYNTHETIC TOUCH at iPad portrait 1032×1376, 32 checks — needs a dev server |
| `bun run import` | **A44** — download each template, fill it, upload it back, find the records; 28 checks — needs a dev server |
| `bun run screenshots` | Regenerate `docs/screenshots/` — needs a dev server |
| `bun run brand-reference` | Re-capture `docs/brand/` from the live artzenu.org.il — needs the internet, NOT a dev server |

> The six browser scripts (`layout`, `wizard`, `touch`, `import`,
> `screenshots`, `brand-reference`) take `BASE_URL`, e.g.
> `BASE_URL=http://localhost:62807 bun run layout`.

> **Toolchain:** this machine has **no Node.js**. Bun is at `/usr/local/bin/bun`
> (Homebrew, Intel prefix `/usr/local`). `npm`/`node` fail with "command not
> found".

**Live preview:** https://azmer-fts.github.io/lo-yanum/
Public repo: https://github.com/Azmer-FTS/lo-yanum — deploys on every push to
`main` via `.github/workflows/deploy.yml`.

State: **FINAL ORDER OF MARCH IN PROGRESS (2026-08-30). PHASE P0 IS DONE
(font correction + P0.1/P0.2/P0.3). PHASE P1 STARTED: G10 IS DONE. Next:
G18, then G12, then G13.** One commit per unit. Branch `main`, NOT yet pushed
(deploy happens at G12).

> **THE FINAL ORDER OF MARCH (product-owner prompt, 2026-08-30).** The product
> owner starts field work in TWO DAYS on an iPad Pro 13" (+ iPhone). The goal
> is a REAL tool — online, usable offline — by the end of this order. Four
> phases, in this order:
>
> · **P0** — last UX asks. ✅ DONE (see below).
> · **P1** — finish the POC: **G10 ✅ → G18 → G12 → G13**, specs already in
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
| **A24** | **Zero overflow / pinned overlap at 390 px on every screen** | ✅ `bun run layout` — 23/23 |
| **A44** | **One template source, three rosters, a link that becomes a pin (G10)** | ✅ `bun run accept` A44 section (36 checks) + `bun run import` (28 checks: download → fill → upload → find) |
| **A61** | **Three map states per map-first screen, persisted (P0.1)** | ✅ dashboard / farms / farm-detail / route / incidents / missions + both rosters; verified by hand at 1032×1376 and 402×874, captures due at G12 |
| **A62** | **Locality bubbles + tap-filter + נקה on both rosters (P0.2)** | ✅ `bun run accept`, the A62 section (12 checks), plus the tap path in `bun run touch` |
| **A63** | **Every map gesture by finger at iPad portrait (P0.3)** | ✅ `bun run touch` — 32 checks at 1032×1376 with `hasTouch` and no mouse anywhere |

---

## 5. Screenshots — `docs/screenshots/`

Every row exists at both `-mobile` (390 px) and `-desktop` (1280 px) — 27 rows,
54 files.

> Captures are taken against the PRODUCTION BUILD (`bun run build` then
> `bun run preview`), not the dev server. Lot 0.9 lost two full runs to
> `networkidle` timeouts on a loaded machine: the dev server transforms every
> module per request and Vite holds an HMR websocket open for the life of the
> page, so "the network went quiet" is a state this app can legitimately never
> reach. The scripts now wait for the dev toolbar's `<select>` instead, and a
> static server removes the load entirely.

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

All nine are committed and runnable.

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
- **`scripts/tokens.ts`** (`bun run tokens`) — A28 + A29. A static gate over
  `src/`, and the only one that needs neither a browser nor a running app. Both
  rules it enforces are rules about RESTRAINT, which is what a codebase loses
  quietly: nobody adds a fifth radius or a second orange on purpose, they add one
  because the component in front of them needed it and the rule lived in a
  document. Strips comments before matching, so the prose describing a rule is
  not read as a violation of it.
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

`bun run contrast` — **133 pairs on the Artzenu palette, all meet WCAG AA.**
Eleven pairs were added this lot: text and the field hairline on the new
`--surface-field`, the field's luminance step inside a card, and the `critical`
role as a solid fill, a bar and a marker. Tightest margins:

| Pair | Light | Dark | Min |
|---|---|---|---|
| `status-warn` / `farm-contacted` dot on the page | 3.18 | 8.87 | 3 |
| `farm-visited` dot on the page | 3.56 | 6.88 | 3 |
| `text-on-accent` on solid `status-violet` / `farm-signed` | 4.59 | 7.69 | 4.5 |
| `text-on-accent` on solid `status-info` / `farm-verbal-ok` | 4.60 | 8.17 | 4.5 |
| `text-on-accent` on solid `status-success` | 4.62 | 9.02 | 4.5 |
| `status-info` chip (ink on 15 % tint) | 6.11 | 4.67 | 4.5 |
| `text-muted` on `surface-high` | 4.84 | 4.92 | 4.5 |
| `text-on-brand` on `brand-olive` (plate, lightest stop) | 5.59 | 5.59 | 4.5 |
| `text-on-accent` on solid `status-danger` (charter orange) | 5.22 | 7.69 | 4.5 |
| `border-strong` on `surface-field` (the field edge) | 1.97 | 3.15 | 1.8 |
| `surface-field` vs `surface-raised` (field in a card) | 1.00 | 1.27 | 1.0 / 1.2 |
| `text-on-accent` on solid `critical` | 5.22 | 5.22 | 4.5 |
| `critical` marker on `surface-base` | 3.29 | 5.08 | 3 |
| `border-subtle` on `surface-base` | 1.23 | 2.00 | 1.2 |
| `surface-raised` vs `surface-base` (elevation) | 1.10 | 1.29 | 1.05 / 1.25 |

The two ends of the window decision 33 describes are still what binds the light
palette: a dot has to be dark enough to be seen on the page (3.18) while the
same colour has to be light enough to be written on (4.59). Both are within 3 %
of their threshold, which is the point — the palette is as saturated as AA
allows, and the charter's own orange `#EF4F28` fits inside that window
unmodified.

Elevation is held to a stricter threshold in dark: a drop-shadow is invisible
on near-black, so the card must separate from the page by luminance alone. The
same reasoning added the field step this lot: with the tinted background gone,
`--border-strong` is the ONLY thing that says "you can type here", so it is
audited at 1.8 rather than at the 1.2 a decorative card edge gets — and in dark
the field additionally has to sit a measurable step below the card it is in.
`--surface-field` was darkened from `#0E2419` to `#091910` to clear that.

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
  templates.ts            ★ G10 — THE IMPORT COLUMNS, one source of truth.
                          Three templates (volunteers/farms/drivers); the
                          .xlsx, the header guess, the mapping options and
                          the required set are all derived from it.
  import.ts               Validation only (columns live next door). Problems
                          REJECT; warnings (מיקום חסר) do not.
  photo.ts routing.ts messages.ts config.ts sessions.ts
  mock/                   farms(12) · people(300 volunteers, 6 drivers) ·
                          generate.ts (seeded PRNG) · anchors(4) · missions(6,
                          one seeded mismatch) · incidents(5) · visits.ts

src/locales/he.json       ★ ALL UI COPY. en/fr intentionally {}.

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
  components/             mapMode ★ (P0.1 — the three map states, per screen) ·
                          PeopleMap (P0.2 — the rosters' locality bubbles) ·
                          AnchorMap ★ (F2 — the map that CREATES anchor points,
                          shared by the wizard, the farm detail and the form) ·
                          MapPanel (map-first shell, D2) · MapCanvas/MapView (lazy) ·
                          Timeline (D6) · FarmVisitModal (D4) · CreateGuardFab (D3.4) ·
                          Avatar · PhotoField · PresenceRoster · ThemeToggle ·
                          badges (vivid/ink) · primitives · fields · layouts ·
                          ContactActions
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

- **State is in memory only.** A reload resets everything, including photos,
  created guards and planned visits.
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
- **Two chunks exceed Vite's 500 kB warning** (MapLibre ~806 kB, SheetJS
  ~500 kB). Both are split and lazily fetched; the initial bundle is ~146 kB
  gzipped.
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
9. **Is the sea meant to be violet on the night map?** The single hue rotation
   that lands the Negev on forest green necessarily throws the Mediterranean the
   other way (`docs/brand-artzenu.md` §3). It is desaturated almost to neutral
   and only a corner of the frame, but if the coordinator finds it distracting
   the fix is a keyed vector provider in Lot 1, not another rotation.

---

## 12. Next step

**PHASE P1 — finish the POC: G10 → G18 → G12 → G13.** Their specs are in §1's
resume note, unchanged. Then P2 (Lot 1) and P3 (Lot 2 essential) per the final
order of march recorded at the top of this file.

**Both P2 blockers are ANSWERED (product owner, 2026-08-30):**

1. **Creating `lo-yanum-prod` is APPROVED** — eu-central-1 (Frankfurt), the
   PO's own Supabase organisation, free tier, expected cost 0. If the account
   holds more than one organisation, ask which before creating.
2. **The coordinator account is `dov@serialkolors.com`.** One account in
   phase 1. **Never set the password**: invite the address and let the PO
   choose it in Supabase's own flow. No credential is ever typed into this
   app or committed.

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
