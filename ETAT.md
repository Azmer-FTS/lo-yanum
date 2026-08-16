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
| `bun run dev` | Dev server on :5173 |
| `bun run build` | Typecheck + production build to `dist/` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run contrast` | WCAG audit of the design tokens (A13) — fails the build on a regression |
| `bun run screenshots` | Regenerate `docs/screenshots/` (dev server must be running) |

> **Toolchain:** this machine has **no Node.js**. Bun is at `/usr/local/bin/bun`
> (Homebrew, Intel prefix `/usr/local`). `npm`/`node` fail with "command not
> found".

**Live preview:** https://azmer-fts.github.io/lo-yanum/
Public repo: https://github.com/Azmer-FTS/lo-yanum — deploys on every push to
`main` via `.github/workflows/deploy.yml`.

State: **Lot 0.6 complete.** Branch `main`.

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
| **Lot 0.6** | Map-first everywhere, light/dark themes, hierarchy, photos, tap-to-call | ✅ **Done** |
| Lot 1 | Supabase: schema, auth, RLS mirroring `/src/core/access.ts`, Storage for photos | Not started |
| Lot 2 | Offline-first sync | Not started |
| Lot 3 | Real agreement signing + PDF storage | Not started |
| Lot 4 | Scheduling assistance | Not started |
| Lot 5 | Notifications (SMS gateway for kosher phones, push for smartphones) | Not started |
| Lot 6 | EN + FR translations | Not started |

---

## 4. Lot 0.6 — delivered

| # | Scope | State |
|---|---|---|
| C1 | Reusable `MapPanel`; map-first on farms, route planner, incidents, missions | ✅ |
| C2 | Light / dark / system themes, per-role defaults, persisted | ✅ |
| C3 | Section headings lifted out of their cards | ✅ |
| C4 | Dashboard restructured around a full-height map column | ✅ |
| C5 | Photos on people and farms, capture + import, avatars everywhere | ✅ |
| C6 | Tap-to-call on every field-screen person | ✅ |
| C7 | Verification pass, screenshots, deployment | ✅ |

### Acceptance criteria

`accept06.ts` (see §7) asserts A4–A7, A10, A12, A14, A15 against `@core`
directly; A8/A16/A17 were measured in-browser; A13 is `bun run contrast`.

| # | Criterion | State |
|---|---|---|
| A1 | Zero hardcoded UI strings in `/src/ui` | ✅ grep clean |
| A2 | `/src/core` free of React/DOM | ✅ clean — photo *maths* is pure; canvas capture lives in `ui/PhotoField.tsx` |
| A3 | Screens navigable, RTL, at 390 / 1280 px | ✅ screenshots |
| A4 | Role isolation enforced in core | ✅ 12 farms / 300 volunteers vs 1 farm / 0 roster |
| A5 | Both anchor message formats | ✅ Waze link vs zero-link kosher text |
| A6 | Nearest-neighbour + Google Maps multi-stop URL | ✅ 10 stops |
| A7 | Urgent report → coordinator + farmer | ✅ |
| A8 | Volunteers table smooth at 300 rows | ✅ 16 800 px of scroll as ~22 DOM rows |
| A9 | Import wizard flags 2 duplicates + 1 missing phone | ✅ `samples/a9-test-import.csv` |
| A10 | Mismatch visible driver ↔ group ↔ coordinator | ✅ seeded on שמואל וייס, 3 call contacts |
| A11 | Deployed URL works on mobile | ✅ https://azmer-fts.github.io/lo-yanum/ |
| A12 | Theme toggle works, persists, correct per-role defaults | ✅ coordinator→light, field→dark, stored per role |
| A13 | Contrast table printed, all AA | ✅ `bun run contrast` — see §6 |
| A14 | Photo capture + import; avatars on all listed surfaces | ✅ mixed state: 149/300 volunteers, 4/6 drivers |
| A15 | Every field-screen number is a working `tel:` link | ✅ |
| A16 | List ↔ marker hover synchronised both ways | ✅ marker 20→30 px on row hover; row tints on marker hover |
| A17 | Live trace on every tick; both Waze and Google Maps links valid | ✅ 10 numbered markers + dashed polyline |

### Screenshots — `docs/screenshots/`

| Screen | 390 px | 1280 px |
|---|---|---|
| Dashboard (light) | [mobile](docs/screenshots/1-dashboard-light-mobile.png) | [desktop](docs/screenshots/1-dashboard-light-desktop.png) |
| Dashboard (dark) | [mobile](docs/screenshots/2-dashboard-dark-mobile.png) | [desktop](docs/screenshots/2-dashboard-dark-desktop.png) |
| Farms, map-first | [mobile](docs/screenshots/3-farms-map-first-mobile.png) | [desktop](docs/screenshots/3-farms-map-first-desktop.png) |
| Route planner + trace | [mobile](docs/screenshots/4-route-planner-mobile.png) | [desktop](docs/screenshots/4-route-planner-desktop.png) |
| Incidents, map-first | [mobile](docs/screenshots/5-incidents-map-first-mobile.png) | [desktop](docs/screenshots/5-incidents-map-first-desktop.png) |
| Driver roster + avatars | [mobile](docs/screenshots/6-driver-roster-mobile.png) | [desktop](docs/screenshots/6-driver-roster-desktop.png) |
| Volunteers table | [mobile](docs/screenshots/7-volunteers-table-mobile.png) | [desktop](docs/screenshots/7-volunteers-table-desktop.png) |

> Map screens need ~6 s to settle (WebGL init + OSM tiles + `fitBounds`). The
> capture script waits; screenshotting sooner yields an empty map.

---

## 5. Standing decisions

Lot 0 decisions 1–13 and Lot 0.5 decisions 14–20 all still hold. New:

21. **Two palettes, one set of semantic names.** `tokens.css` holds the LIGHT
    palette on `:root` and the DARK overrides under `[data-theme='dark']` plus
    a `prefers-color-scheme` copy for "system". **No component ever branches on
    the theme** — `surface-raised` means "the card surface" in both. Adding a
    colour means adding a token in both blocks, never a conditional in a
    component.

22. **`accent` (fill) and `accent-ink` (text) are different tokens.** The brand
    amber is legible as a button fill in both themes but unreadable as text on
    paper. Splitting them is what let the identity survive the light theme;
    `text-accent-ink` is the only correct class for accent-coloured text.

23. **Light hover BRIGHTENS the amber.** Darkening it (the usual reflex) drops
    the near-black button label below AA — measured 3.68:1 before the fix.

24. **Contrast is enforced by a script, not by eye.** `bun run contrast` parses
    the tokens, reconstructs both palettes, and checks text, chips (composited
    over their own 15 % tint), markers and elevation steps. It exits non-zero on
    failure. Because it parses `--token: r g b;` triplets, **the channel format
    in tokens.css is load-bearing** — a hex value there breaks both the audit
    and every Tailwind `/opacity` utility.

25. **Section headings live above their card** (`<Section>` renders them
    outside). Cards contain content only; `.section-title` is now just a
    sub-label used *inside* a card.

26. **One map instance per screen.** `MapPanel` renders the map once and moves
    it with CSS. Rendering a desktop copy and a mobile copy created two WebGL
    contexts and two sets of tile requests, one permanently invisible.

27. **Map framing is keyed on geometry, never on the marker array.** Hover
    restyling produces a new markers array on every pointer move; re-running
    `fitBounds` on that re-framed the map continuously.

28. **`readToken()` emits `rgb(r, g, b)` with commas.** Tokens are stored space-
    separated for Tailwind, but MapLibre's colour parser only accepts the legacy
    comma form — the modern syntax throws inside the style-load handler.

29. **`avatarHue` uses FNV-1a + an avalanche finalizer.** The classic
    `h * 31 + c` maps near-identical strings to near-identical outputs, so
    sequential ids ("drv-01"…"drv-06") all landed on the same side of any
    threshold and adjacent volunteers got indistinguishable avatar colours.
    The finalizer must re-normalise with `>>> 0` before the modulo — `^=` yields
    a *signed* int in JS and the hue came out negative.

30. **Photos are data URIs in the mock store, downscaled to 512 px before
    storage.** A phone photo is 3–8 MB; a handful would make the store
    unusable. **Lot 1 replaces the value with a Supabase Storage key** — the
    model already just carries `photo: string | null`, so nothing else changes.

31. **Waze gets step-by-step links, Google Maps gets one multi-stop URL.** Waze
    has no multi-stop URL scheme, so rather than silently dropping stops the
    planner emits one link per farm in visit order. Both apps are offered
    because coverage and routing quality differ by area in the Negev.

---

## 6. Contrast audit (A13)

`bun run contrast` — all pairs meet WCAG AA. Tightest margins:

| Pair | Light | Dark | Min |
|---|---|---|---|
| `text-muted` on `surface-high` | 4.72 | 5.15 | 4.5 |
| `text-muted` on `surface-raised` | 5.31 | 5.66 | 4.5 |
| `text-on-accent` on `accent-dim` | 4.76 | 8.29 | 4.5 |
| status/farm chips on their own 15 % tint | ≥ 4.72 | ≥ 4.95 | 4.5 |
| `surface-raised` vs `surface-base` (elevation) | 1.11 | 1.38 | 1.05 / 1.25 |

Elevation is held to a stricter threshold in dark: a drop-shadow is invisible
on near-black, so the card must separate from the page by luminance alone. In
light it also has a shadow and a border to lean on.

---

## 7. Verification scripts

- **`scripts/contrast.ts`** (committed, `bun run contrast`) — the A13 audit.
- **`accept06.ts`** (scratchpad, recreate from §4) — imports `@core/index`,
  switches `setSession()` between roles, asserts A4–A7, A10, A12, A14, A15.
  It drives core rather than the DOM, which is what proves the role gate lives
  in the data layer.
- **A8/A16/A17** were measured in-browser. Note when writing such probes:
  React delegates `onMouseEnter` through a **bubbling `mouseover`**, so a raw
  non-bubbling `mouseenter` will not trigger it; map markers use a plain
  `addEventListener` and do respond to the native event.

---

## 8. Source of truth

```
src/styles/tokens.css     ★ BOTH PALETTES + radius/motion/type. No hex anywhere else.

src/core/                 PURE TS — no React, no DOM
  types.ts                Domain types, LegConfirmation, resolveConfirmation
  access.ts               ★ THE ROLE GATE. Every screen reads through it.
  store.ts                Observable store + mutations. `_raw()` is access.ts-only.
  theme.ts                Theme POLICY (defaults per role, resolution). No storage.
  photo.ts                Initials, avatar hash, placeholder portraits, size limits.
  import.ts               CSV/XLSX validation rules (no SheetJS)
  routing.ts              Nearest-neighbour, Google Maps URL, Waze step links, polyline
  geo.ts clock.ts config.ts sessions.ts messages.ts
  mock/                   farms(12) · people(300 volunteers, 6 drivers) ·
                          generate.ts (seeded PRNG) · anchors(4) · missions(6,
                          one seeded mismatch) · incidents(5)

src/locales/he.json       ★ ALL UI COPY. en/fr intentionally {}.

src/ui/
  theme.tsx               Theme APPLICATION: localStorage + data-theme + matchMedia
  components/             MapPanel (map-first shell) · MapCanvas/MapView (lazy) ·
                          Avatar · PhotoField (camera + import + downscale) ·
                          PresenceRoster · ThemeToggle · badges (readToken) ·
                          primitives · fields · layouts · ContactActions
  screens/coordinator/    Dashboard · FarmsList(map-first) · FarmDetail · FarmForm ·
                          AnchorSheet · AnchorForm · RoutePlanner(map-first) ·
                          Volunteers · VolunteerFormModal · ImportWizard ·
                          Missions(map-first) · MissionDetail ·
                          Incidents(map-first) · IncidentDetail
  screens/farmer|volunteer|driver/
```

---

## 9. Known limitations (not regressions)

- **State is in memory only.** A reload resets everything, including photos and
  anything created through the forms.
- **Placeholder portraits are synthetic SVGs**, deliberately obviously so. Real
  uploads work through the form; the *fixtures* are generated.
- **"Pick on map" on the anchor form is a disabled placeholder**; coordinates
  are typed.
- **Route polyline is straight segments**, not road geometry — there is no
  routing service. It exists to make the ORDER legible, not to navigate by.
- **Two chunks exceed Vite's 500 kB warning** (MapLibre ~806 kB, SheetJS
  ~500 kB). Both are split and lazily fetched; the initial bundle is ~130 kB
  gzipped.
- **OSM raster tiles** — must move to a keyed vector provider in Lot 1.

---

## 10. Open questions

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

---

## 11. Next step

**Lot 1 — Supabase.** Translate `src/core/access.ts` into RLS policies one
function at a time; the bodies are written to make that a direct transcription.
`src/core/import.ts` is written to be re-runnable server-side unchanged, and
`photo: string | null` becomes a Storage object key.

Do **not** add Supabase, auth or offline sync before Lot 1 is explicitly begun.
