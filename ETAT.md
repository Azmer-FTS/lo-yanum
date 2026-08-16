# לא ינום — ETAT

> הִנֵּה לֹא יָנוּם וְלֹא יִישָׁן שׁוֹמֵר יִשְׂרָאֵל
> — תהלים קכ"א, ד

**Lo Yanum** ("He does not slumber") — coordination tool for a volunteer
farm-protection programme in the northern and central Negev.

This file is the project's memory. A completely fresh session must be able to
read it and resume with no questions asked. **Every session starts with "Read
ETAT.md and continue."**

---

## 1. Resume command

```bash
bun install && bun run dev
```

Then open http://localhost:5173 and pick an identity on the landing screen.

> **Toolchain note:** this machine has **no Node.js**. Bun 1.3.14 is installed at
> `/usr/local/bin/bun` (Homebrew, Intel prefix `/usr/local`). All commands use
> `bun` — `npm`/`node` fail with "command not found". `bun x tsc --noEmit`
> typechecks; `bun run build` builds; `bun run screenshots` regenerates the
> images in `docs/screenshots/` (needs the dev server running).

State: **Lot 0.5 complete except R1 (deployment), which is blocked on GitHub
credentials — see §10.** Branch `main`.

---

## 2. Vision

A field coordinator enrols Negev farmers (signed agreement), then schedules
volunteer night guards (yeshiva students) and volunteer drivers who transport
them. Farms are remote; network coverage is frequently zero. Some volunteers
carry "kosher phones" (calls + SMS only, no internet), so every guard group
includes at least one smartphone holder who acts for the group.

One shared data model serves four roles:

| Role | Sees |
|---|---|
| **Coordinator** | Everything: farms, volunteers, drivers, missions, incidents |
| **Farmer** | Only his own farm: tonight's guard, upcoming/past guards, his commitments; can report events |
| **Driver** | Only his own trips: nominative pick-up and return confirmation |
| **Volunteer** (group-phone holder) | Only his own guard: location, instructions, phones; confirms arrival, end, and presence for every group member |

---

## 3. Lot plan

| Lot | Scope | State |
|---|---|---|
| **Lot 0** | Visual POC — full UI, realistic fake data, no backend, role switcher | ✅ Done |
| **Lot 0.5** | Night Watch redesign, editing flows, nominative confirmation, public preview | ✅ Done (R1 blocked) |
| Lot 1 | Supabase: schema, auth, RLS policies mirroring `/src/core/access.ts` | Not started |
| Lot 2 | Offline-first sync (the desert has no signal) | Not started |
| Lot 3 | Real agreement signing + PDF storage | Not started |
| Lot 4 | Scheduling assistance (auto-suggest volunteer/driver assignments) | Not started |
| Lot 5 | Notifications: SMS gateway for kosher phones, push for smartphones | Not started |
| Lot 6 | EN + FR translations, multi-region support | Not started |

---

## 4. Lot 0.5 — what was delivered

| # | Scope | State |
|---|---|---|
| R1 | Private GitHub repo + Pages deployment | ⛔ **Blocked** — see §10 |
| R2 | "Night Watch" design system, all tokens in one file | ✅ Done |
| R3 | Full-bleed desktop, map-as-screen, unified horizontal filter bars | ✅ Done |
| R4 | Volunteers rebuilt for 300+ (virtualised table, sort, fuzzy search, grouping) | ✅ Done |
| R5 | Editing flows: farm, anchor point, volunteer, CSV/XLSX import wizard | ✅ Done |
| R6 | Double nominative confirmation replacing all +/− counters | ✅ Done |
| R7 | Field event reporting rebuilt as a 2 AM-usable alert flow | ✅ Done |
| R8 | Verification pass + screenshots | ✅ Done |

### Acceptance criteria

Everything is re-verified after the redesign. The A4/A5/A6/A7/A9/A10 checks run
as an executable script rather than by eye — see §7.

| # | Criterion | State |
|---|---|---|
| A1 | Zero hardcoded UI strings in `/src/ui` | ✅ `grep -rnP '[\x{0590}-\x{05FF}]' src/ui` → empty |
| A2 | `/src/core` has zero React/DOM imports | ✅ empty; also no `@ui` import, and zero hex literals outside `tokens.css` |
| A3 | All screens navigable, fully RTL, at 390 / 820 / 1280 px | ✅ Screenshots in `docs/screenshots/` |
| A4 | Role isolation enforced in `/src/core` | ✅ coordinator 12 farms + 300 volunteers; farmer 1 farm + 0 roster; volunteer/driver own missions only |
| A5 | Anchor sheet shows both message formats | ✅ smartphone has a Waze link; kosher has **no** `http` at all, plus written route + decimal coordinates |
| A6 | Nearest-neighbour from Jerusalem + Google Maps multi-stop URL | ✅ 10 farms, monotonic cumulative distance, first stop הר עמשא at 47.2 km |
| A7 | Urgent volunteer report → coordinator alerts + farmer view | ✅ and a *different* farmer does not see it |
| A8 | Volunteers table smooth with 300 rows | ✅ 16,800 px of scroll rendered as **22 DOM rows**; 0.49 ms per scroll step |
| A9 | Import wizard flags 2 duplicate phones + 1 missing phone | ✅ exactly 3 flagged; fixture at `samples/a9-test-import.csv` |
| A10 | Mismatch visible driver ↔ group holder ↔ coordinator | ✅ 1 seeded mismatch on שמואל וייס; dashboard alert carries 3 one-tap call contacts |
| A11 | Deployed URL works on mobile | ⛔ Blocked with R1 |

### Screenshots

Regenerate with `bun run screenshots` (dev server must be running).

| Screen | 390 px | 1280 px |
|---|---|---|
| Dashboard | [mobile](docs/screenshots/1-dashboard-mobile.png) | [desktop](docs/screenshots/1-dashboard-desktop.png) |
| Global map | [mobile](docs/screenshots/2-global-map-mobile.png) | [desktop](docs/screenshots/2-global-map-desktop.png) |
| Volunteers table | [mobile](docs/screenshots/3-volunteers-table-mobile.png) | [desktop](docs/screenshots/3-volunteers-table-desktop.png) |
| Farm form | [mobile](docs/screenshots/4-farm-form-mobile.png) | [desktop](docs/screenshots/4-farm-form-desktop.png) |
| Volunteer "my guard" | [mobile](docs/screenshots/5-volunteer-my-guard-mobile.png) | [desktop](docs/screenshots/5-volunteer-my-guard-desktop.png) |

---

## 5. Design tokens — "Night Watch"

**`src/styles/tokens.css` is the only place a colour may be defined.** Tailwind
consumes it in `tailwind.config.js`; no component contains a hex literal, and
the A2 grep enforces that.

Colours are stored as **space-separated RGB channels**, not hex, and exposed as
`rgb(var(--token) / <alpha-value>)`. That is what makes `bg-surface-raised/60`
and `text-accent/70` work. **A hex value in that file silently breaks every
`/opacity` utility in the app** — this is the one rule to remember when editing
tokens.

| Group | Tokens | Purpose |
|---|---|---|
| Surfaces | `--surface-sunken` `-base` `-raised` `-overlay` `-high` | Ascending elevation, `#080D18` → `#1B2846`. Elevation is signalled by luminance, not borders. |
| Borders | `--border-subtle` `--border-strong` | Card edges vs input/focus edges |
| Text | `--text-primary` `-secondary` `-muted` `-on-accent` | Warm off-white `#F4EFE4`, never pure white — it glares at night |
| Accent | `--accent` `-strong` `-dim` | Fire/torch amber `#F59E0B`. **Primary actions and highlights only.** |
| Status | `--status-success` `-warn` `-danger` `-info` | Tuned for contrast on the dark ground |
| Farm pipeline | `--farm-*` (7) | Read by chips, list dots **and** map markers alike |
| Elevation | `--shadow-card` `-lift` `-accent` | Black shadow + 1px inset top highlight; grey drop-shadows are invisible on dark |
| Radius | `--radius-sm/md/lg/xl/pill` | 8 / 12 / 16 / 20 px |
| Motion | `--duration-fast/base/slow`, `--ease-out` | 150 / 180 / 220 ms |
| Type | `display / title / heading / body / caption / micro` | Line-height tightens as size grows; `.numeric` for tabular figures |

Tailwind aliases: `surface-*`, `edge-*`, `content-*`, `accent`, `status-*`,
`farm-*`. Component classes (`.card`, `.btn-primary`, `.filter-pill`, `.input`,
`.skeleton`, …) live in `src/index.css`.

MapLibre needs two special cases, both in `src/index.css`: its chrome is
restyled to the night palette, and `.map-night` applies
`invert(1) hue-rotate(180deg) … saturate(0.25)` to the tile canvas. The heavy
desaturation is deliberate — without it the inverted Negev renders as a loud
orange that fights the amber accent. Only the GL canvas is filtered; markers
are DOM siblings, so their token colours stay true.

---

## 6. Standing decisions

Lot 0 decisions 1–13 all still hold. **1 (core purity), 2 (role gate),
3 (no strings in UI), 4 (logical properties), 5 (`.ltr-nums`), 6 (hour-offset
mock data), 7 (self-hosted Rubik), 9 (raster OSM → replace in Lot 1),
10 (hash routing), 11 (`RequireRole` is not the security boundary),
12 (PWA-ready not installed), 13 (Hebrew only)** are unchanged. Decision 8
(lazy MapLibre) is extended below. New decisions from Lot 0.5:

14. **One token file, no hex in components.** See §5. Colours needed outside
    React (MapLibre markers) go through `readStatusColor()` / `readToken()` in
    `badges.tsx`, which read the computed custom property — so the token file
    stays authoritative even for imperative DOM.

15. **Counters are gone; presence is nominative.** `LegConfirmation` stores the
    driver's mark and the group holder's mark **independently, per person, per
    leg**, and never merges them. `resolveConfirmation()` returns `mismatch`
    when they disagree rather than picking a winner. Rationale: "5 of 6" tells
    the coordinator someone is missing but not *who*, and at 05:00 in the
    desert that is the only thing that matters. `self` is a third channel that
    only smartphone-carrying volunteers can use — kosher-phone holders
    structurally cannot self-confirm, which is exactly why the group holder
    confirms on their behalf.

16. **Mock data is deterministic.** `src/core/mock/generate.ts` uses a seeded
    mulberry32 PRNG, never `Math.random()`. The 300-row roster must be
    identical on every reload or screenshots drift and "row 214" means nothing
    between two sessions.

17. **Mock phone numbers use the unallocated `05X-000NNNN` range.** No Israeli
    operator issues numbers with a `000` body, so no fixture can collide with a
    real person's number once the repo is public. Real emergency numbers
    (100/101/102) are deliberately left real.

18. **Heavy dependencies are lazy.** MapLibre (~805 kB) and SheetJS (~500 kB)
    are separate chunks; SheetJS is fetched only when a file is actually
    dropped on the import wizard. Initial bundle stays ~126 kB gzipped, which
    is the number that matters on a phone with one bar of signal.

19. **Import validation lives in core, not the wizard.** `src/core/import.ts`
    takes a plain string matrix and knows nothing about SheetJS, files or
    React, so Lot 1 can re-run the identical rules server-side. Column
    auto-mapping is conservative: an unrecognised header maps to `ignore`
    rather than to a wrong guess. Order matters in `guessField` — "סוג טלפון"
    contains "טלפון", so the phone-type rule must be tested before the phone
    rule.

20. **One filter bar pattern.** `FilterBar` + `FilterPill` above the content on
    farms, volunteers, missions and incidents. No side panels — they stole
    width from the data, and four screens had drifted into four different
    filter idioms.

---

## 7. Verification scripts

The acceptance checks are executable, not eyeballed. Both live in the
scratchpad (not committed) and can be recreated from this description:

- **`accept.ts`** — imports `@core/index` directly, switches `setSession()`
  between roles and asserts A4, A5, A6, A7 and A10. Because it drives core
  rather than the DOM, it proves the role gate is in the data layer.
- **`a9b.ts`** — parses `samples/a9-test-import.csv`, runs `guessField` +
  `analyseImport`, and asserts exactly 3 flagged rows.

A8 was measured in-browser: the scroll container reports `scrollHeight`
16,800 px with 22 rendered rows, and 30 programmatic scroll steps complete in
14.8 ms.

`samples/a9-test-import.csv` is committed: 6 rows, of which 2 carry phone
numbers already in the roster and 1 has no phone. Drop it on
`#/coordinator/volunteers/import` to reproduce A9 by hand.

---

## 8. Source of truth — where things live

```
src/styles/tokens.css     ★ EVERY COLOUR, SHADOW, RADIUS, DURATION, TYPE STEP

src/core/                 PURE TS — no React, no DOM
  types.ts                Domain types + LegConfirmation / resolveConfirmation
  access.ts               ★ THE ROLE GATE. Every screen reads through this file.
                          Also getPresenceRows / getPresenceMismatches / getAlerts
  store.ts                In-memory observable store + all mutations.
                          `_raw()` is access.ts-only.
  import.ts               CSV/XLSX validation rules (pure; no SheetJS)
  sessions.ts             POC role-switcher presets. DELETE IN LOT 1.
  routing.ts  geo.ts      Nearest-neighbour planning, haversine, Waze/Maps URLs
  messages.ts             The two anchor-message formats. Structure only.
  clock.ts                Time arithmetic + Intl formatting. isTonight() lives here.
  config.ts               Coordinator identity, emergency numbers
  mock/                   farms(12) · people(25 authored + 275 generated = 300) ·
                          generate.ts (seeded PRNG) · anchors(4) · missions(6,
                          one seeded mismatch) · incidents(5)

src/locales/he.json       ★ ALL UI COPY. en.json / fr.json intentionally {}.

src/ui/
  components/             Icon · badges (status colours + readToken) ·
                          primitives (FilterBar, Modal, Callout, Skeleton…) ·
                          fields (form primitives) · layouts (full-bleed shell) ·
                          MapView (lazy) + MapCanvas · PresenceRoster (R6) ·
                          IncidentReportForm (R7) · ContactActions · DevToolbar
  screens/coordinator/    Dashboard · FarmsList · FarmDetail · FarmForm ·
                          AnchorSheet · AnchorForm · GlobalMap · RoutePlanner ·
                          Volunteers · VolunteerFormModal · ImportWizard ·
                          Missions · MissionDetail · Incidents · IncidentDetail
  screens/farmer|volunteer|driver/   field screens, incl. VolunteerRosterScreen

scripts/screenshots.ts    Playwright capture at 390 / 1280 px
samples/                  A9 import fixture
.github/workflows/deploy.yml   Pages deployment (ready; never run — see §10)
```

---

## 9. Known limitations (not regressions)

- **State is in memory only.** A reload resets everything, including anything
  created through the new edit forms and import wizard. Intentional for a POC.
- **`fullPage` screenshots are avoided** — Playwright renders `position: sticky`
  at document position, which makes sticky bars appear to float mid-page.
- **"Pick on map" is a disabled placeholder** on the anchor form; coordinates
  are typed. Visual picking is a Lot 1 item.
- **Volunteer guard history is aggregate only** (count + last activity); there
  is no per-guard log until the backend exists.
- **Two chunks exceed Vite's 500 kB warning** (MapLibre, SheetJS). Both are
  deliberately split and lazily fetched.
- **`en.json` / `fr.json` are `{}`** by design.
- **OSM raster tiles** — must move to a keyed vector provider in Lot 1.

---

## 10. ⛔ R1 — deployment is blocked on credentials

Everything for deployment is written and committed:
`.github/workflows/deploy.yml` (bun → typecheck → build → Pages), and
`vite.config.ts` uses `base: './'`, which works for a project Pages site, a
custom domain and `file://` alike — **no base change is needed**.

**The blocker:** both `gh` keyring entries hold the *same* token, and it
authenticates as **`mgnamsellem`** (id 262224805), not `Azmer-FTS`:

```bash
gh auth token --user Azmer-FTS   # → a token whose /user is mgnamsellem
```

You asked for the repo under Azmer-FTS and explicitly ruled out mgnamsellem, so
nothing was created. To unblock, run this in a real terminal and sign in as
**Azmer-FTS**:

```bash
gh auth login --hostname github.com --git-protocol https --web
```

Then verify and create:

```bash
gh auth switch --user Azmer-FTS && gh api user --jq .login
```

Once `gh api user --jq .login` prints `Azmer-FTS`:

```bash
gh repo create Azmer-FTS/lo-yanum --public --source=. --remote=origin --push
```

**Public vs private:** GitHub Pages only serves *public* repos on the free
plan. The repo was audited before this was written — no real emails, no
secrets, no personal data; all 50 mock phone numbers were rewritten into the
unallocated `05X-000NNNN` range (decision 17). It is safe to publish. If the
repo must stay private, Pages needs a paid plan.

After the first push, enable Pages once: **Settings → Pages → Source: GitHub
Actions**. The workflow then deploys on every push to `main`, and the URL will
be `https://azmer-fts.github.io/lo-yanum/`.

---

## 11. Open questions for the coordinator

1. When driver and group holder disagree about one person, who should be
   called first — the volunteer, the driver, or the group holder? The dashboard
   currently offers all three as equal one-tap buttons.
2. Should a mismatch block the mission from being marked `completed` until a
   human resolves it, or is a standing alert enough?
3. Should the import wizard be able to *update* existing volunteers matched by
   phone, rather than only skipping them as duplicates?
4. Are anchor-point instructions per-anchor (current model) or should some be
   programme-wide defaults inherited by every anchor?
5. Should a farmer see volunteers' phone numbers before the group confirms
   arrival, or only once they are on site?
6. Do incidents need a severity escalation path with an audit trail, or is the
   follow-up thread enough?

---

## 12. Next step

Either finish R1 (§10 — one `gh auth login` away), or start **Lot 1**:
translate `src/core/access.ts` into RLS policies one function at a time. The
function bodies are written to make that a direct transcription, and
`src/core/import.ts` is written to be re-runnable server-side unchanged.

Do **not** add Supabase, auth or offline sync before Lot 1 is explicitly begun.
