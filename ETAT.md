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
cd "/Users/clyoapple/Desktop/CLAUDE PROJECT/LO YANOUM" && bun install && bun run dev
```

Then open http://localhost:5173 and pick an identity on the landing screen.

> **Toolchain note:** this machine has **no Node.js**. Bun 1.3.14 is installed at
> `/usr/local/bin/bun` (Homebrew, Intel prefix `/usr/local`). All commands use
> `bun` — `npm`/`node` will fail with "command not found". `bun x tsc --noEmit`
> typechecks; `bun run build` builds.

State: **Lot 0 complete.** Branch `main`, all of M1–M8 committed.

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
| **Driver** | Only his own trips: pick-up list, drop-off and pick-up confirmations |
| **Volunteer** (group-phone holder) | Only his own guard: location, instructions, phones; confirms arrival and end; reports events with severity + GPS |

---

## 3. Lot plan

| Lot | Scope | State |
|---|---|---|
| **Lot 0** | Visual POC — full UI, realistic fake data, no backend, role switcher | ✅ **Done** |
| Lot 1 | Supabase: schema, auth, RLS policies mirroring `/src/core/access.ts` | Not started |
| Lot 2 | Offline-first sync (the desert has no signal) | Not started |
| Lot 3 | Real agreement signing + PDF storage | Not started |
| Lot 4 | Scheduling assistance (auto-suggest volunteer/driver assignments) | Not started |
| Lot 5 | Notifications: SMS gateway for kosher phones, push for smartphones | Not started |
| Lot 6 | EN + FR translations, multi-region support | Not started |

---

## 4. Current state — Lot 0

### Mandates

| # | Scope | State |
|---|---|---|
| M1 | Vite + React + TS + Tailwind, RTL, Rubik, i18n (he/en/fr), core/ui split, fake session | ✅ Done |
| M2 | Typed, role-filtered mock data layer in `/src/core` | ✅ Done |
| M3 | Coordinator screens 1–4 (dashboard, farms list, farm detail, anchor sheet) | ✅ Done |
| M4 | Coordinator screens 5–6 (global map, route planner) | ✅ Done |
| M5 | Coordinator screens 7–9 (volunteers, missions, incidents) | ✅ Done |
| M6 | Field screens 10–15 + role switcher | ✅ Done |
| M7 | Responsive pass at 390 / 820 / 1280 px | ✅ Done |
| M8 | This file | ✅ Done |

### Acceptance criteria

| # | Criterion | State |
|---|---|---|
| A1 | Zero hardcoded UI strings — no Hebrew literals in `/src/ui` | ✅ `grep -rP '[\x{0590}-\x{05FF}]' src/ui` → empty |
| A2 | `/src/core` has zero React/DOM imports | ✅ `grep -rE "from '(react\|react-dom)" src/core` → empty |
| A3 | All 16 screens navigable, fully RTL, on three viewports | ✅ Verified in-browser |
| A4 | Role isolation enforced in `/src/core`, not in components | ✅ All screens read through `@core/access` |
| A5 | Anchor sheet shows both message formats | ✅ Waze-link + kosher plain-text, each with copy + send |
| A6 | Route planner: nearest-neighbour from Jerusalem + Google Maps multi-stop URL | ✅ Verified: 10-farm route, valid `dir/?api=1&…&waypoints=…` URL |
| A7 | Urgent incident from volunteer → coordinator alerts + farmer view | ✅ Verified end-to-end in browser |

### The 16 screens

**Coordinator** (`#/coordinator/…`, desktop sidebar)
1. `` — dashboard: counters, alerts, tonight's guards, next visits, volunteer stats
2. `farms` — searchable/filterable list (status filter is in the URL: `?status=active`)
3. `farms/:farmId` — detail: info, contacts, status stepper, commitments, anchors, agreements, map, notes, incidents, guard history
4. `farms/:farmId/anchors/:anchorId` — anchor sheet with **both** generated messages
5. `map` — MapLibre + OSM, markers by status, toggleable legend, mini card
6. `route` — multi-select farms → nearest-neighbour order → Google Maps URL
7. `volunteers` — grouped by yeshiva, filters, archive dialog with reason
8. `missions` / `missions/:missionId` — list + detail with timeline and count confirmations
9. `incidents` / `incidents/:incidentId` — journal + thread view with follow-up entries and map pin

**Farmer** (`#/farmer/…`, mobile-first)
10. `` — tonight on my farm (empty state when no guard)
11. `guards` — upcoming/past + discreet commitments reminder
12. `report` — event report form

**Volunteer** (`#/volunteer/…`, mobile-first)
13. `` — my guard: anchor, Waze, instructions, phones, "We arrived" / "End of guard"
14. `report` — severity, description, photo placeholder, auto GPS, emergency numbers when urgent

**Driver** (`#/driver/…`, mobile-first)
15. `` — pick-up list, destination, drop-off and morning pick-up confirmation with mismatch alert

**Shared**
16. Dev toolbar role switcher (bottom bar, every screen) + landing screen identity picker

---

## 5. Standing decisions

Written out in full — do not re-litigate these without a reason.

1. **`/src/core` is framework-free.** No React, no DOM, no `window`/`document`.
   It is plain TypeScript so it can move to React Native or a Capacitor wrap or
   a Node worker unchanged. The UI depends on core; core never depends on the UI.
   Enforced by the A2 grep.

2. **The UI never filters data by role.** Every screen calls an accessor in
   `src/core/access.ts` and renders whatever comes back. Each accessor maps 1:1
   to a future Supabase RLS policy. `src/core/store.ts` exports `_raw()` for
   unfiltered data, and **only `access.ts` may call it**.

3. **No hardcoded strings anywhere in `/src/ui`.** Everything goes through
   `t('…')`. This includes the generated SMS/WhatsApp message templates:
   `src/core/messages.ts` takes a `labels` object supplied by i18next, so it
   holds message *structure* only, never copy.

4. **RTL via CSS logical properties.** `ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`,
   never `pl-`/`pr-`/`left-`/`right-`. Switching to `dir="ltr"` must need no
   component changes. The one exception is the forward chevron, which flips with
   `rtl:-scale-x-100`.

5. **Numbers render LTR inside RTL text** via the `.ltr-nums` class (phone
   numbers, coordinates, dates, ratios like `3 / 12`). A ratio must be one single
   `.ltr-nums` run — two separate runs get reordered by the bidi algorithm and
   display backwards.

6. **Live mock data uses hour offsets, not wall-clock times.**
   `src/core/mock/missions.ts` places the in-progress and about-to-start guards
   with `hoursFromNow(±n)`, so the POC demos correctly whether it is opened at
   09:00 or 02:00. Only the far-future guards use day offsets. `isTonight()` is
   therefore a *window* test (not finished yet, starts within 14 h), never a
   calendar-day test — a guard night spans two dates.

7. **Rubik is self-hosted** (`public/fonts/rubik-{hebrew,latin,latin-ext}.woff2`,
   variable 300–700, `@font-face` in `src/index.css`). No Google Fonts request at
   runtime.

8. **MapLibre is lazy-loaded.** `MapView.tsx` is a `React.lazy` wrapper around
   `MapCanvas.tsx`. It is the heaviest dependency by far; splitting it keeps the
   initial bundle at ~105 KB gzipped instead of ~327 KB, which matters on a
   phone with one bar of signal.

9. **Raster OSM tiles, no API key.** Fine for a POC. **Lot 1 must move to a keyed
   vector tile provider** — the public OSM tile servers are not for production
   traffic.

10. **Hash routing** (`HashRouter`), so the built `dist/` opens from any static
    host or `file://` with no server rewrite rules.

11. **`RequireRole` is a convenience, not the security boundary.** It only stops
    a stale URL from landing on another role's screen. The real isolation is the
    data layer (decision 2).

12. **PWA-ready, not PWA-installed.** Manifest and icons ship; service-worker
    registration is deliberately deferred to Lot 2 with offline sync.

13. **Hebrew only for now.** `en.json` and `fr.json` exist and are wired into
    i18next but are intentionally `{}` — they fall back to Hebrew.

---

## 6. Source of truth — where things live

```
src/core/                 PURE TS — no React, no DOM
  types.ts                All domain types. Field names mirror the future Postgres schema.
  access.ts               ★ THE ROLE GATE. Every screen reads through this file.
  store.ts                In-memory observable store + mutations. `_raw()` is access.ts-only.
  sessions.ts             POC role-switcher presets. DELETE IN LOT 1 (with DevToolbar).
  routing.ts              Nearest-neighbour route planning + Google Maps URL.
  geo.ts                  Haversine, bounds, Waze/Maps URLs, HOME_BASE (Jerusalem).
  messages.ts             The two anchor-message formats. Structure only, copy is injected.
  clock.ts                All time arithmetic + Intl formatting. isTonight() lives here.
  config.ts               Coordinator identity, emergency numbers.
  mock/                   farms.ts (12) · people.ts (25 volunteers, 6 drivers) ·
                          anchors.ts (4) · missions.ts (6) · incidents.ts (5)

src/locales/he.json       ★ ALL UI COPY. en.json / fr.json are empty placeholders.

src/ui/
  App.tsx                 Routes + RequireRole
  i18n.ts                 i18next init, applyLanguage() sets <html lang/dir>
  hooks/useCore.ts        useSyncExternalStore bridge to the core store
  components/             Icon · badges (status colours) · primitives · layouts ·
                          MapView (lazy) + MapCanvas · ContactActions ·
                          IncidentReportForm · DevToolbar
  screens/                LandingScreen + coordinator/ farmer/ volunteer/ driver/
```

**Status colours are defined once**, in `src/ui/components/badges.tsx`
(`FARM_STATUS_COLOR`). Map markers, list chips and detail headers all read from
it, so a status can never look green in one screen and amber in another.

---

## 7. Known limitations (not regressions)

- **State is in memory only.** A page reload resets everything to the mock data.
  Intentional for Lot 0 — persistence is Lot 1.
- **Vite reports a >500 kB chunk warning** for `MapCanvas`. Expected; that chunk
  is MapLibre and it is already split out and lazy-loaded.
- **Geolocation falls back to the anchor point** when the browser denies it or
  there is no fix. Realistic for the Negev, and it keeps the report form usable.
- **`en.json` / `fr.json` are `{}`** by design (M1). Switching language shows
  Hebrew via fallback.
- **Agreements are mock entries** — a filename and a signature date, no real PDF.
- **OSM raster tiles** — see decision 9.

---

## 8. Open questions for the coordinator

1. Should a farmer be able to see the volunteers' phone numbers *before* the
   group confirms arrival, or only once they are on site?
2. Are anchor-point instructions per-anchor (current model) or should some be
   programme-wide defaults inherited by every anchor?
3. When a driver confirms a pick-up count that does not match the roster, who
   gets notified first — the coordinator, or the group-phone holder?
4. Do incidents need a severity escalation path (observation → urgent) with an
   audit trail, or is the follow-up thread enough?

---

## 9. Next step

Lot 1 — Supabase. The first task is translating `src/core/access.ts` into SQL
RLS policies one function at a time; the function bodies are written to make
that a direct transcription.

Do **not** add Supabase, auth, or offline sync to Lot 0.
