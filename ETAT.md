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
| `bun run contrast` | WCAG audit of the design tokens (A13/A19) — fails the build on a regression |
| `bun run dispatch` | Guard-scoring verification (A21) — 27 checks, no browser needed |
| `bun run accept` | Acceptance criteria driven through `@core` (A4–A23) — 64 checks |
| `bun run layout` | 390 px overflow + pinned-overlap sweep over all 22 screens (A24) — needs a dev server |
| `bun run screenshots` | Regenerate `docs/screenshots/` — needs a dev server |
| `bun run brand-reference` | Re-capture `docs/brand/` from the live artzenu.org.il — needs the internet, NOT a dev server |

> The three browser scripts take `BASE_URL`, e.g.
> `BASE_URL=http://localhost:62807 bun run layout`.

> **Toolchain:** this machine has **no Node.js**. Bun is at `/usr/local/bin/bun`
> (Homebrew, Intel prefix `/usr/local`). `npm`/`node` fail with "command not
> found".

**Live preview:** https://azmer-fts.github.io/lo-yanum/
Public repo: https://github.com/Azmer-FTS/lo-yanum — deploys on every push to
`main` via `.github/workflows/deploy.yml`.

State: **Lot 0.8 complete.** Branch `main`.

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
| **Lot 0.8** | **Artzenu brand charter — palette, typography, mark** | ✅ **Done** |
| Lot 1 | Supabase: schema, auth, RLS mirroring `/src/core/access.ts`, Storage for photos | Not started |
| Lot 2 | Offline-first sync | Not started |
| Lot 3 | Real agreement signing + PDF storage | Not started |
| Lot 4 | Scheduling assistance (promote `dispatch.ts` from proposal to automation) | Not started |
| Lot 5 | Notifications (SMS gateway for kosher phones, push for smartphones) | Not started |
| Lot 6 | EN + FR translations | Not started |

---

## 4. Lot 0.8 — delivered

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

## 4b. Lot 0.7 — delivered

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
| **A24** | **Zero overflow / pinned overlap at 390 px on every screen** | ✅ `bun run layout` — 22/22 |

---

## 5. Screenshots — `docs/screenshots/`

Every row exists at both `-mobile` (390 px) and `-desktop` (1280 px).

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

> 11 and 18 are the same screen in the two themes, and they exist as a pair
> because the day/night tile filter is a token that changed this lot. 21 and 22
> are also a pair on purpose: the brand plate is IDENTICAL in both, and only two
> captures make that visibly a decision rather than an oversight.

> Map screens need ~6 s to settle (WebGL init + OSM tiles + `fitBounds`). The
> capture script waits; screenshotting sooner yields an empty map.

---

## 6. Standing decisions

Lot 0 decisions 1–13, Lot 0.5 decisions 14–20, Lot 0.6 decisions 21–31 and
Lot 0.7 decisions 32–40 all still hold, **except 22 and 23, which decision 32
generalises**. Decisions 32–34 survived Lot 0.8 unchanged and are what made it
cheap — only VALUES moved. New:

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

All four are committed and runnable.

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
- **`scripts/layout.ts`** (`bun run layout`) — A24. Walks all 22 screens at
  390 px and asserts no horizontal overflow, no element wider than the
  viewport, and no two pinned elements overlapping. It caught two real bugs:
  the sticky form footer sitting under the demo toolbar, and a `min-width:auto`
  grid item letting the presence table push the page 40 px wide. Lot 0.8 caught a
  THIRD: Mekomi is a wider face than Rubik, and that alone was enough for the
  farm-card grid's `min-width: auto` tracks to push the page to 397 px. Both
  tracks now carry `min-w-0`. This is the script that pays for itself every lot —
  a 7 px overflow is invisible in a screenshot.

The interactive half of A20 was played in the browser with a throw-away
Playwright script (17 assertions: ordering, auto-fill, refusal, promotion,
gauge, creation, and the guard appearing in the list). Recreate it from §4 if
the wizard changes.

Note when writing such probes: React delegates `onMouseEnter` through a
**bubbling `mouseover`**, so a raw non-bubbling `mouseenter` will not trigger
it; map markers use a plain `addEventListener` and do respond to the native
event.

---

## 8. Contrast audit (A13/A19)

`bun run contrast` — **122 pairs on the Artzenu palette, all meet WCAG AA.**
Four pairs were added this lot: the brand plate's ink against both ends of
`--gradient-brand`, in both themes. Tightest margins:

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
| `border-subtle` on `surface-base` | 1.23 | 2.00 | 1.2 |
| `surface-raised` vs `surface-base` (elevation) | 1.10 | 1.29 | 1.05 / 1.25 |

The two ends of the window decision 33 describes are still what binds the light
palette: a dot has to be dark enough to be seen on the page (3.18) while the
same colour has to be light enough to be written on (4.59). Both are within 3 %
of their threshold, which is the point — the palette is as saturated as AA
allows, and the charter's own orange `#EF4F28` fits inside that window
unmodified.

Elevation is held to a stricter threshold in dark: a drop-shadow is invisible
on near-black, so the card must separate from the page by luminance alone.

---

## 9. Source of truth

```
docs/brand-artzenu.md     ★ THE CHARTER. Provenance of every colour and font
                            value, the three AA adjustments, the licence
                            question. READ BEFORE touching colour or type.
docs/brand/               Reference plates from the live site (bun run brand-reference)

src/styles/tokens.css     ★ BOTH PALETTES. The four --brand-* tokens quote the
                            charter verbatim; the rest is derived. Vivid/ink
                            pairs, gradients, radius, motion, type. No hex
                            anywhere else.
public/fonts/             8 self-hosted brand woff2 (atlas-*, mekomi-*) + 3 Rubik
public/artzenu-mark.png   The association's mark, grey+alpha, painted as a CSS
                            MASK so it takes a token colour in both themes

src/core/                 PURE TS — no React, no DOM
  types.ts                Domain types, LegConfirmation, FarmVisit, AgendaEvent
  access.ts               ★ THE ROLE GATE. Every screen reads through it.
  store.ts                Observable store + mutations. `_raw()` is access.ts-only.
  dispatch.ts             ★ GUARD SCORING (D5). Pure, deterministic, tested.
  contrast.ts             WCAG maths, shared by the audit script and /styleguide
  clock.ts                Time + calendar arithmetic (DST-safe, Sunday-first)
  geo.ts                  Haversine, LOCALITY_POSITIONS gazetteer, bounds
  theme.ts                Theme POLICY (defaults per role). No storage.
  photo.ts import.ts routing.ts messages.ts config.ts sessions.ts
  mock/                   farms(12) · people(300 volunteers, 6 drivers) ·
                          generate.ts (seeded PRNG) · anchors(4) · missions(6,
                          one seeded mismatch) · incidents(5) · visits.ts

src/locales/he.json       ★ ALL UI COPY. en/fr intentionally {}.

src/index.css             ★ @font-face for both brand faces; the brand face bound
                            to the type SCALE (unlayered, after utilities, on
                            purpose); .btn/.input/.artzenu-mark
src/ui/
  theme.tsx               Theme APPLICATION: localStorage + data-theme + matchMedia.
                          The theme-color meta READS --surface-base rather than
                          restating it (Lot 0.8 found two stale literals there).
  components/             MapPanel (map-first shell, D2) · MapCanvas/MapView (lazy) ·
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
- **"Pick on map" on the anchor form is a disabled placeholder**; coordinates
  are typed.
- **Route polyline is straight segments**, not road geometry — there is no
  routing service. It exists to make the ORDER legible, not to navigate by.
- **`LOCALITY_POSITIONS` covers the 20 towns the fixtures use.** A locality
  outside it is charged a flat 80 km rather than scoring zero, and reports
  `distanceKm: null` so the UI shows "—" instead of a fabricated number.
- **The agenda has no drag-and-drop.** Events are opened and edited, not moved.
- **Two chunks exceed Vite's 500 kB warning** (MapLibre ~806 kB, SheetJS
  ~500 kB). Both are split and lazily fetched; the initial bundle is ~146 kB
  gzipped.
- **OSM raster tiles** — must move to a keyed vector provider in Lot 1.

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
8. **⚠️ BLOCKING FOR REAL USERS — do the Artzenu font licences cover this app?**
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

**Lot 1 — Supabase.** Translate `src/core/access.ts` into RLS policies one
function at a time; the bodies are written to make that a direct transcription.
`src/core/import.ts` is written to be re-runnable server-side unchanged,
`src/core/dispatch.ts` is a candidate for a Postgres function verbatim, and
`photo: string | null` becomes a Storage object key.

Do **not** add Supabase, auth or offline sync before Lot 1 is explicitly begun.

Two Lot 0.8 items to carry in: settle open question 8 (font licences) before any
real user sees the app, and move off OSM raster tiles to a keyed vector provider
— a vector style can be themed in the charter's greens directly instead of being
approximated with a CSS `hue-rotate` on a raster.
