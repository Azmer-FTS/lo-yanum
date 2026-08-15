# לא ינום — Lo Yanum

> הִנֵּה לֹא יָנוּם וְלֹא יִישָׁן שׁוֹמֵר יִשְׂרָאֵל — תהלים קכ"א, ד

Coordination tool for a volunteer farm-protection programme in the Negev.
**Lot 0: visual POC — full UI, realistic fake data, no backend.**

## Run

This machine has no Node.js; use Bun.

```bash
bun install && bun run dev
```

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on http://localhost:5173 |
| `bun run build` | Typecheck + production build to `dist/` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run preview` | Serve the built `dist/` |

Pick an identity on the landing screen, or switch roles any time from the dark
bar at the bottom of every screen.

## Architecture in one paragraph

`/src/core` is pure TypeScript with zero React and zero DOM — types, mock data,
the observable store, route planning, message generation, and the role-filtered
accessors. `/src/ui` is every React component. Screens never filter data by
role; they call an accessor in `src/core/access.ts`, each of which maps 1:1 to a
future Supabase RLS policy. All UI copy lives in `src/locales/he.json`.

**Full project state, decisions and next steps: [ETAT.md](ETAT.md).**
