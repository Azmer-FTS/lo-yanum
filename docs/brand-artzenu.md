# Artzenu brand charter — extraction and adoption (Lot 0.8)

The app is built for **Artzenu** (ארצנו, [artzenu.org.il](https://artzenu.org.il)),
the association that runs **שומרים בחוות**. This document records where the
association's visual identity actually comes from, how it was translated into
the app's design tokens, and every point where the two had to diverge.

Nothing here was picked by eye. The palette and the typography were extracted
from the site's own stylesheets and font binaries; the two places where a
judgement was made instead of a measurement are marked **DECISION** and say why.

---

## 1. Provenance

| Source | What was read |
|---|---|
| `https://artzenu.org.il/` | HTML — the stylesheet manifest and the custom `@font-face` block |
| `wp-content/uploads/elementor/css/post-15.css` | **The Elementor "kit"** — the global colour and typography variables. This is the charter. |
| `…/post-10.css`, `…/post-33.css`, `…/post-21.css` | Home page, header and footer — how each colour is actually *used* |
| `https://artzenu.org.il/settlement/` + `…/post-354.css` | An interior page, to confirm the usage pattern holds beyond the home page |
| `wp-content/uploads/2023/05/logo-hd-new-colors3.png` | The mark — decoded and analysed pixel by pixel |
| `…/2023/06/atlas-*.woff2`, `…/2023/05/mekomi-*.woff2` | The two brand faces — `cmap`, `GSUB` and `hmtx` tables parsed directly |

Reference plates: [`docs/brand/`](brand/) — `artzenu-home-hero.jpg`,
`artzenu-home-full.jpg`, `artzenu-settlement-hero.jpg`,
`artzenu-settlement-full.jpg`. Regenerate with `bun run brand-reference`.

The site runs WordPress + Elementor + Hello Elementor. That matters: Elementor
publishes its global styles as CSS custom properties on a single
`.elementor-kit-15` rule, so the charter is not inferred from rendered pixels —
it is a literal list of declared values.

---

## 2. The extracted palette

Straight from `.elementor-kit-15`, with the role each one is observed to play
(usage counted across the home page, the header, the footer and an interior
page — 316 references in total).

| Hex | Elementor name | Uses | Observed role |
|---|---|---|---|
| `#0B3D2C` | `f06adda` | 19 | **Every heading, h1–h6.** Dark section backgrounds, the far end of every gradient. |
| `#6E9558` | `accent` | 42 | **Default button background.** Section fills, the nav-item underline. |
| `#476E34` | `fc28385` | 37 | Button **hover**, link **hover**, the near end of every gradient. |
| `#14A185` | `primary` | 57 | **Links.** Stacked icon backgrounds, borders, accents on dark. |
| `#EF4F28` | `secondary` | 41 | The one loud CTA (`היו שותפים`), highlight fills. |
| `#FFFFFF` | `21bfb04` | 131 | Page and card background, text on every dark fill. |
| `#E9F2EA` | `ad41708` | 24 | **Input background.** Soft washes, translucent chips (`#E9F2EAAB`). |
| `#414141` | `text` | 15 | Body copy. |
| `#292929` | `e5e9561` | 12 | Labels, emphasised copy. |
| `#787878` | `08fcc9d` | — | Muted copy. |
| `#A7A7A7` | `d345fd2` | — | Lighter muted. |
| `#D9D9D9` | `57a29b1` | 2 | Hairlines. |
| `#C0D7B4` | *(raw)* | 4 | Decorative sage. |
| `#D3DED4` | *(raw)* | 1 | Decorative pale sage. |

Verified live in the browser on the interior page: `body` is
`rgb(255,255,255)` with `rgb(65,65,65)` text at 17 px; the CTA computes to
`background rgb(239,79,40)`, `color rgb(255,255,255)`, `border-radius 30px`,
`padding 10px 20px`.

### Gradients, radii, shadows

The site's own values, verbatim:

```css
/* gradients — always dark olive → deep forest, always 158° or 180° */
linear-gradient(158deg, #476E347D 0%, #0B3D2C 100%)
linear-gradient(180deg, #0B3D2C 0%, #6E955861 100%)

/* radii — 20 occurrences of the pill, 12 of the circle */
border-radius: 30px 30px 30px 30px;   /* every button AND every input */
border-radius: 100%;                  /* icon and social circles */
border-radius: 0% 0% 40% 40%;         /* the header's curved underside */

/* shadows — long, soft, offset */
box-shadow: 0 10px 35px -10px rgba(0,0,0,0.15);
box-shadow: 0 10px 30px 0    rgba(0,0,0,0.20);
box-shadow: 0 -10px 20px 5px rgba(0,0,0,0.10);
```

### The mark

`logo-hd-new-colors3.png` is 2560 × 1440, 4-bit palette, 13 entries. Decoded:
**87.05 % fully transparent, 11.83 % pure `#FFFFFF`**, the remaining 1.1 %
white at partial alpha (anti-aliasing). It is a **white-on-transparent** asset,
made for placement on the site's dark green header.

Curiously, the transparent palette entry still carries `#47704C` — a green
within a point or two of `#476E34`, left over from when the artwork was
flattened over the brand olive.

It is cropped to its content box (2125 × 1060), box-filtered down to 321 × 160
and stored as an **8-bit grey + alpha PNG**, 9.7 kB, at
[`public/artzenu-mark.png`](../public/artzenu-mark.png).

### The typefaces

Two custom faces, declared under their Hebrew names and self-hosted by the
association. **Neither is a Google Font**, which is worth stating plainly
because the brief assumed they would be.

| Site name | Weights declared | Where the site uses it |
|---|---|---|
| **אטלס** (Atlas) | 100, 200, `normal`, 500, 600, 800 | h1–h6, body copy, links, labels, inputs |
| **מקומי** (Mekomi) | 200, `normal`, 500, 600, 800 | **Buttons only** |

Every heading on the site is Atlas at `line-height: 1.1em`; every button is
Mekomi. Both files were parsed (WOFF2 header → brotli → `cmap`/`GSUB`/`hmtx`):

| | Atlas | Mekomi |
|---|---|---|
| Units per em | 1000 | 1000 |
| Codepoints mapped | 495 | 507 |
| Latin `A–Z a–z` | 58/58 | 58/58 |
| Hebrew `א–ת` | 27/27 | 27/27 |
| Nikkud present | 20/55 | 19/55 |
| **Tehillim 121:4 coverage** | **complete** | **complete** |
| `GSUB` has `tnum` | **no** | **yes** |
| Digit advances (units) | 636, 412, 550, 531, 570, 525, 559, 502, 603, 557 | 617 × 10 |
| **Figures** | **proportional** | **tabular, by default** |

Confirmed again in the live browser at 100 px: Atlas digits spread **22.41 px**
and `font-variant-numeric: tabular-nums` changes nothing (there is no feature
for it to switch on); Mekomi digits spread **0.00 px**.

---

## 3. Translation into tokens

Source of truth: [`src/styles/tokens.css`](../src/styles/tokens.css). Four
tokens quote the charter verbatim and everything else is derived from them.

```css
--brand-forest: 11 61 44;   /* #0B3D2C */
--brand-olive:  71 110 52;  /* #476E34 */
--brand-teal:   20 161 133; /* #14A185 */
--brand-orange: 239 79 40;  /* #EF4F28 */
```

### Light — the site's own arrangement

| Token | Value | Comes from |
|---|---|---|
| `surface-base` | `#F1F6EF` | `#E9F2EA` diluted — a green-tinted paper |
| `surface-raised` / `overlay` | `#FFFFFF` | the site's card and page white |
| `surface-high` | `#E9F2EA` | **the charter's own wash, unchanged** |
| `surface-sunken` | `#DFEBDD` | the wash, one step deeper, for wells |
| `border-subtle` / `strong` | `#D3E2D0` / `#A9BFA4` | `#D9D9D9` given the page's green cast |
| `text-primary` | `#0B3D2C` | **the charter's heading colour, unchanged** |
| `text-secondary` / `muted` | `#2F4A3E` / `#566E60` | `#414141` / `#787878`, greened |
| `accent` (fill) | `#6E9558` | **the charter's button background, unchanged** |
| `accent-ink` (text) | `#476E34` | **the charter's button-hover olive, unchanged** |
| `accent-strong` / `dim` | `#86AF6B` / `#658A50` | the accent lifted / lowered for hover and press |
| `status-danger` | `#EF4F28` | **the charter's CTA orange, unchanged** |
| `status-success` | `#0F8E75` | the charter's teal, darkened — see §4 |
| `gradient-brand` | `#476E34` → `#0B3D2C`, 158° | **the site's hero wash, its own angle** |

Adopting `#0B3D2C` as the app's primary ink is the single change that makes a
screenshot read as Artzenu. Every heading, every label, every table cell is now
set in the association's heading green.

### Dark — derived, because there is nothing to copy

The site is light-only. Rather than invent an Artzenu night palette, the dark
theme keeps the charter's **hues** and drops the **surfaces** into the same
forest family as `#0B3D2C`:

`#04100B` → `#07180F` → `#123024` → `#173B2C` → `#1B4433`, with ink
`#EBF4EE` / `#C2D8C9` / `#9AB4A5` and the accent lifted to `#8FBE73`. Lot 0.7's
generic navy is gone; the app now looks like the same product at night.

### Status hues — functional first

The twelve semantic hues were warmed and pulled toward the charter's
temperature, but **differentiation was never traded for harmony**. Two of them
are literally brand colours; the rest keep their position on the wheel.

| Role | Light | Dark | Note |
|---|---|---|---|
| success / farm-active | `#0F8E75` | `#34C9A6` | the charter's teal |
| warn / farm-contacted | `#C07A08` | `#E8A93C` | ochre |
| danger / farm-declined | `#EF4F28` | `#FF8163` | **the charter's orange** |
| info / farm-verbal-ok | `#0F86B8` | `#4FB6E0` | lake blue |
| violet / farm-signed | `#8F63E8` | `#B295FA` | violet |
| farm-visited | `#D24DAB` | `#E877C6` | magenta |
| farm-to-contact | `#6E8478` | `#8DA598` | sage-grey — a blue-grey on a green page reads as a foreign element |

### Typography — the split, and the measurement behind it

```css
--font-brand: 'Artzenu Atlas', 'Artzenu Mekomi', 'Rubik', system-ui, sans-serif;
--font-sans:  'Artzenu Mekomi', 'Rubik', system-ui, -apple-system, sans-serif;
```

- **Atlas** carries `display`, `title`, `section` and `heading` — the same job
  it has on the site.
- **Mekomi** carries everything else: body, caption, micro, tables, and the KPI
  `metric` step. On the site it is the button face; here it is the interface
  face.
- **Rubik** is demoted to fallback and still self-hosted, so `font-display:
  swap` has something real to render first.

**DECISION — why the body is not Atlas.** The brief allowed keeping Rubik for
small interface text if the brand face was weak there. The measurement says
something more specific: Atlas has **no tabular figures at all** — proportional
digits with a 54 % advance spread and no `tnum` feature to switch. This app is a
column of numbers (KPI strip, presence tables, phone numbers, a 300-row roster,
`.numeric` and `.ltr-nums` everywhere), and in Atlas none of it would align.
Mekomi's digits are monospaced *by default*. So the numbers go to the face that
can set them — and because that face is also an Artzenu font, the split stays
inside the charter instead of falling back to Rubik.

Both faces cover Tehillim 121:4 completely, nikkud and shin/sin dots included,
so the verse is set in Atlas.

The two files are served from `/public/fonts` for the same reason Rubik is: the
field roles work in the Negev with no coverage, and a CDN `@import` is a blank
screen at 02:00 on a farm track.

> ⚠️ **Licence — open question for Lot 1.** Atlas and Mekomi are commercial
> Hebrew typefaces, not open-licence webfonts. The binaries here are the
> association's own, taken from the association's own site, for the
> association's own tool — but a web licence covering `artzenu.org.il` does not
> automatically cover a second application. **This has to be confirmed with
> Artzenu before the app ships to real users.** If it is not covered, deleting
> the eight `atlas-*`/`mekomi-*` files is the whole rollback: the font stacks
> already fall through to Rubik, and nothing else in the app changes.

### Controls — where the pill stops

The charter's control shape is a 30 px pill, on buttons *and* inputs.

- **Buttons take it literally.** `.btn` is `rounded-pill` with `px-5`; `.btn-big`
  is a full-width pill, which is the site's CTA at scale. Radii went up a step
  overall (`sm 10 / md 14 / lg 18 / xl 26`).
- **DECISION — inputs do not.** `.input` stays at `--radius-md`. A pill input
  spends ~15 px of its own start padding, and a twelve-field form of pills has
  no left edge for the eye to run down. Containers stay boxes for the same
  reason: a data table with 30 px corners is not scannable.
- Icon tiles and the emblem take the charter's circle.
- Shadows adopted the site's long soft offset drop and are tinted `#0B3D2C`
  rather than neutral grey — a grey shadow on a green page reads as dirt.

### Icons and the map

Lucide is kept (the site has no icon set of its own), at unchanged sizes.

The MapLibre tile filter is a theme token and both ends were re-tuned:

```css
/* day */   saturate(0.9) brightness(1.03) contrast(1.02) hue-rotate(8deg)
/* night */ invert(1) hue-rotate(-80deg) brightness(0.82) contrast(0.92)
            saturate(0.22) sepia(0.12)
```

The night rotation is derived, not guessed: OSM's desert beige (`~#F0E4CE`)
inverts to a dark blue at hue ~220°, and −80° is exactly what lands that on the
forest green at ~140°. The same rotation necessarily throws the Mediterranean
the other way (its inverse sits at ~14° and ends up violet) — that is what the
heavy desaturation is for. The day rotation is *positive*: rotating the other
way turns the Negev pink, which was the first thing tried and the first thing
rejected.

### The mark in the app

The PNG is white-on-transparent, so it is painted as a **CSS mask**
(`.artzenu-mark`) with `background-color: currentColor`. It therefore takes a
*token* colour and stays legible in both themes — an `<img>` would be
white-on-white the moment light is picked. It appears:

- on the landing screen, above the app name, as the association's imprint;
- at the far end of the expanded desktop rail and the slide-over.

It is deliberately **absent** from the mobile top bar and the field header,
which already carry a theme toggle and a name at 390 px.

### The verse

The landing screen now puts Tehillim 121:4 on a **brand plate** — the site's own
hero gradient without the photograph. The plate is **identical in light and
dark**: a brand does not have a night variant. Its ink therefore cannot come
from `--text-primary`, so there is one theme-independent token for it,
`--text-on-brand: #F4FAF5`, and the audit pins it against the gradient's
lightest stop.

---

## 4. Contrast — every adjustment, and why

`bun run contrast` audits 122 pairs across both themes. **All pass WCAG AA.**
Three charter values could not be used unmodified in a given role; in each case
the *fill* keeps the brand colour and only the *ink* moves, which is what the
vivid/ink split from Lot 0.7 exists for.

| # | Charter value | Where it failed | What was done |
|---|---|---|---|
| 1 | `#6E9558` (accent) as a fill with **white** text, as the site uses it | 3.44:1 — fails AA for body text | **The fill is unchanged.** The ink became near-black green `#06140E` → **5.48:1**. Same brand colour, legible label. |
| 2 | `#14A185` (teal) as a **dot** on the pale green page | 2.89:1 — fails the 3:1 non-text floor | Darkened to `#0F8E75` → dot **3.63:1**, and still carries near-black at **4.62:1**. `#14A185` survives untouched as `--brand-teal` and returns bright in the dark theme. |
| 3 | `#EF4F28` (orange) as `danger` | passes as a fill (**5.22:1** with near-black; **3.29:1** as a dot) but is far too light to be text | Fill unchanged; ink is `#A62A11`, used on the colour's own 15 % wash. |

Two further notes:

- **`text-on-accent` changed identity.** It was a warm near-black for amber
  (`#1A1204`); it is now a near-black **green** (`#06140E`), which buys ~0.3 of
  a ratio point on every olive and green fill in the system.
- **Decision 33's window still binds.** Each light vivid must be dark enough to
  clear 3:1 as a dot on the page *and* light enough to be written on at 4.5:1.
  That is what pins `status-violet`, `status-info` and `farm-visited`; each sits
  within 3 % of one end.

Tightest margins after the change:

| Pair | Light | Dark | Min |
|---|---|---|---|
| `text-muted` on `surface-high` | 4.84 | 4.92 | 4.5 |
| `text-on-accent` on solid `status-violet` / `farm-signed` | 4.59 | 7.69 | 4.5 |
| `text-on-accent` on solid `status-info` / `farm-verbal-ok` | 4.60 | 8.17 | 4.5 |
| `text-on-accent` on solid `status-success` | 4.62 | 9.02 | 4.5 |
| `status-info` chip (ink on 15 % tint) | 6.11 | 4.67 | 4.5 |
| `text-on-brand` on `brand-olive` (plate, lightest stop) | 5.59 | 5.59 | 4.5 |
| `farm-visited` dot on the page | 3.56 | 6.88 | 3 |
| `border-subtle` on `surface-base` | 1.23 | 2.00 | 1.2 |
| `surface-raised` vs `surface-base` (elevation) | 1.10 | 1.29 | 1.05 / 1.25 |

---

## 5. What the charter does NOT govern

- **Layout.** Nothing structural changed in this lot: map-first, the physical-left
  map, the agenda grid, the guard wizard and the timelines are all as Lot 0.7
  left them.
- **Semantics.** A farm status is a function of the pipeline, not of the brand.
  The charter supplied two of the twelve hues and set the temperature of the
  rest; it did not get to collapse any of them.
- **Accessibility.** Where the site itself does not meet AA (white on
  `#6E9558`), the app does not copy the failure.

---

## 6. Regenerating any of this

```bash
bun run brand-reference   # reference plates from the live site
bun run contrast          # the AA audit — the table in §4
bun run screenshots       # docs/screenshots/, including the charter pairs 18–22
```
