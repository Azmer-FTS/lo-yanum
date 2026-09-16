/**
 * ORDRE DE NUIT 2026-09-02 (N4) — THE NATIONAL GAZETTEER, BUILT FROM OPEN DATA.
 *
 *   bun run scripts/gazetteer.ts <localities.csv>
 *
 * Source: "שמות יישובים עם קואורדינטות" — the Survey of Israel's list of
 * every recognised locality with its centre point, published on the
 * government open-data portal (data.gov.il dataset 828, mirrored on the
 * portal's ArcGIS hub as item a589d87604c6477ca4afb78f205b98fb). 1 240
 * localities, WGS84, with the CBS locality code, the Hebrew name, the CBS
 * transliteration and the settlement type. Licence: the data.gov.il open
 * terms ("אחר (פתוח)" — free reuse with attribution). The raw CSV is kept
 * under `docs/data/` with its download date; this script turns it into the
 * compact JSON the app ships, `src/core/gazetteer.json`.
 *
 * Each row becomes `[hebrewName, latinName, lat, lng, kind]` where `kind` is a
 * one-letter class read off the CBS type column — c city, m moshav, k kibbutz,
 * y community (ישוב קהילתי), v other village, ? unknown — enough for the
 * autocomplete to say "מושב" next to a name without carrying the whole
 * Hebrew category string 1 240 times.
 */

const source = process.argv[2] ?? 'docs/data/localities-israel-2026-09-02.csv'
const target = 'src/core/gazetteer.json'

const text = (await Bun.file(source).text()).replace(/^﻿/, '')
const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
const header = lines[0].split(',')
const col = (name: string) => header.indexOf(name)
const X = col('X')
const Y = col('Y')
const HE = col('MGLSDE_LOC')
const EN = col('MGLSDE_L_4')
const TYPE = col('MGLSDE_L_3')

/** A CSV line, honouring quotes — a few English names carry commas. */
function split(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === ',' && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function kindOf(type: string): string {
  if (/קיבוצ/.test(type)) return 'k'
  if (/מושב/.test(type)) return 'm'
  if (/קהילתי/.test(type)) return 'y'
  if (/תושבים|ירושלים|תל אביב|חיפה/.test(type)) return 'c'
  if (/כפרי|בדווי|שבט/.test(type)) return 'v'
  return '?'
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()
const CODE = col('SETL_CODE')

type Row = [string, string, number, number, string, number | null, ...string[]]
const rows: Row[] = []
const seen = new Set<string>()
for (const line of lines.slice(1)) {
  const f = split(line)
  const he = tidy(f[HE] ?? '')
  const lat = Number(f[Y])
  const lng = Number(f[X])
  if (!he || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
  if (lat < 29 || lat > 34 || lng < 34 || lng > 36.5) continue
  const key = `${he}|${lat.toFixed(3)}`
  if (seen.has(key)) continue
  seen.add(key)
  const code = Number(f[CODE])
  rows.push([he, tidy(f[EN] ?? ''), +lat.toFixed(5), +lng.toFixed(5), kindOf(f[TYPE] ?? ''), Number.isInteger(code) && code > 0 ? code : null])
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AM1.1 (2026-09-16) — LE FICHIER DES LOCALITÉS DU למ״ס, FUSIONNÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La liste du Survey (1 174 noms) ne portait ni les ~30 שבטים du Néguev, ni
 * une centaine de localités que le למ״ס enregistre sous un autre nom ou que le
 * Survey n'a pas (חריש, נוף הגליל, אבו תלול…). Une ferme isolée du Néguev se
 * rattache justement à ce genre d'endroit.
 *
 * `docs/data/cbs-bycode2021.xlsx` (« קובץ יישובים 2021 », למ״ס) :
 *   · le CODE (סמל יישוב) est ajouté à chaque ligne du Survey qui le partage ;
 *   · un nom du למ״ס différent pour le MÊME code devient un ALIAS — on le
 *     trouve en tapant l'une ou l'autre graphie, on n'affiche qu'une ligne ;
 *   · un code absent du Survey devient une LIGNE, sa coordonnée ITM (10
 *     chiffres, pas de 10 m : EEEEE NNNNN) convertie en WGS84.
 *
 * ⛔ Écartés : צורת יישוב 530 (« מ״א », des territoires hors localité) et 510
 *    (camps militaires, marqués `*`) — ce ne sont pas des endroits auxquels
 *    une ferme se rattache.
 */
const CBS = process.argv[3] ?? 'docs/data/cbs-bycode2021.xlsx'
{
  const XLSX = await import('xlsx')
  const wb = XLSX.read(new Uint8Array(await Bun.file(CBS).arrayBuffer()))
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][]
  const head = sheet[0] as string[]
  const c = (n: string) => head.indexOf(n)
  const NAME = c('שם יישוב'), SEMEL = c('סמל יישוב'), LATIN = c('תעתיק'), FORM = c('צורת יישוב שוטפת'), XY = c('קואורדינטות')
  const byCode = new Map<number, Row>()
  for (const r of rows) if (r[5] !== null) byCode.set(r[5], r)
  const norm = (s: string) => s.replace(/[׳״'"`]/g, '').replace(/[-־]/g, ' ').replace(/\s+/g, ' ').trim()
  let aliases = 0
  let added = 0
  for (const line of sheet.slice(1)) {
    const name = tidy(String(line[NAME] ?? '')).replace(/\*$/, '').trim()
    const code = Number(line[SEMEL])
    const form = Number(line[FORM])
    if (!name || !Number.isInteger(code)) continue
    if (form === 530 || form === 510 || String(line[NAME]).includes('*')) continue
    const known = byCode.get(code)
    if (known) {
      if (norm(known[0]) !== norm(name) && !known.slice(6).some((a) => norm(String(a)) === norm(name))) {
        known.push(name)
        aliases++
      }
      continue
    }
    const xy = String(line[XY] ?? '').padStart(10, '0')
    if (!/^\d{10}$/.test(xy) || xy === '0000000000') continue
    const { lat, lng } = itmToWgs84(Number(xy.slice(0, 5)) * 10, Number(xy.slice(5)) * 10)
    if (lat < 29 || lat > 34 || lng < 34 || lng > 36.5) continue
    const row: Row = [name, tidy(String(line[LATIN] ?? '')), +lat.toFixed(5), +lng.toFixed(5), cbsKind(form, name), code]
    rows.push(row)
    byCode.set(code, row)
    added++
  }
  console.log(`  למ״ס : ${added} localités ajoutées, ${aliases} graphies en alias`)

  /* ★ AM1.1 — et les graphies du CLASSEUR DE PROSPECTION (198 lignes, toutes
     avec leur code) : « כרמיה », « נוה מבטח »… sont les mots que le PO a sous
     les yeux ; ils doivent trouver leur localité mot pour mot. */
  const PROSPECTION = 'docs/samples/prospection-sud.xlsx'
  const pwb = XLSX.read(new Uint8Array(await Bun.file(PROSPECTION).arrayBuffer()))
  const list = XLSX.utils.sheet_to_json(pwb.Sheets['רשימה'], { header: 1 }) as unknown[][]
  const ph = (list[0] as unknown[]).map(String)
  const PN = ph.indexOf('יישוב')
  const PC = ph.findIndex((h) => h.startsWith('סמל יישוב'))
  let fromSheet = 0
  let missing = 0
  for (const line of list.slice(1)) {
    const name = tidy(String(line[PN] ?? ''))
    const code = Number(line[PC])
    if (!name || !Number.isInteger(code) || code <= 0) continue
    const known = byCode.get(code)
    if (!known) {
      missing++
      continue
    }
    if (norm(known[0]) !== norm(name) && !known.slice(6).some((a) => norm(String(a)) === norm(name))) {
      known.push(name)
      fromSheet++
    }
  }
  console.log(`  prospection : ${fromSheet} graphies en alias, ${missing} code(s) introuvable(s)`)
  if (missing > 0) throw new Error('un code du classeur de prospection manque au gazetteer')
}

/** צורת יישוב (למ״ס) → la lettre de `kindOf`. */
function cbsKind(form: number, name: string): string {
  if (/\(שבט\)/.test(name) || form === 460 || form === 450) return 'v'
  if (form >= 100 && form < 300) return 'c'
  if (form === 330 || form === 340) return 'k'
  if (form === 310 || form === 320) return 'm'
  if (form === 370) return 'y'
  return '?'
}

/**
 * Israeli Transverse Mercator (EPSG:2039) → latitude/longitude. Transverse
 * Mercator inverse on GRS80 (Snyder, *Map Projections*, p. 63), puis le
 * décalage « Israel 1993 → WGS84 » en translation (≈ 50 m, soit cinq fois le
 * pas de la coordonnée du למ״ס — il vaut d'être appliqué).
 */
function itmToWgs84(E: number, N: number): { lat: number; lng: number } {
  const a = 6378137.0
  const f = 1 / 298.257222101
  const e2 = 2 * f - f * f
  const k0 = 1.0000067
  const lat0 = (31 + 44 / 60 + 3.817 / 3600) * Math.PI / 180
  const lon0 = (35 + 12 / 60 + 16.261 / 3600) * Math.PI / 180
  const FE = 219529.584
  const FN = 626907.39
  const M = (phi: number) =>
    a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * phi
      - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
      + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
      - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi))
  const ep2 = e2 / (1 - e2)
  const M1 = M(lat0) + (N - FN) / k0
  const mu = M1 / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
  const C1 = ep2 * Math.cos(phi1) ** 2
  const T1 = Math.tan(phi1) ** 2
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2)
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5
  const D = (E - FE) / (N1 * k0)
  let phi = phi1 - (N1 * Math.tan(phi1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720)
  let lam = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(phi1)
  // Israel 1993 → WGS84 : translation géocentrique (EPSG:1073, −48, +55, +52 m).
  const toXYZ = (p: number, l: number) => {
    const n = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
    return [n * Math.cos(p) * Math.cos(l), n * Math.cos(p) * Math.sin(l), n * (1 - e2) * Math.sin(p)]
  }
  const [x, y, z] = toXYZ(phi, lam)
  const X = x - 48, Y = y + 55, Z = z + 52
  const aw = 6378137.0, fw = 1 / 298.257223563, ew2 = 2 * fw - fw * fw
  lam = Math.atan2(Y, X)
  const pr = Math.hypot(X, Y)
  phi = Math.atan2(Z, pr * (1 - ew2))
  for (let i = 0; i < 6; i++) {
    const n = aw / Math.sqrt(1 - ew2 * Math.sin(phi) ** 2)
    phi = Math.atan2(Z + ew2 * n * Math.sin(phi), pr)
  }
  return { lat: phi * 180 / Math.PI, lng: lam * 180 / Math.PI }
}

rows.sort((a, b) => a[0].localeCompare(b[0], 'he'))

await Bun.write(target, JSON.stringify(rows))
const kinds = rows.reduce<Record<string, number>>((acc, r) => ((acc[r[4]] = (acc[r[4]] ?? 0) + 1), acc), {})
console.log(`  ${rows.length} localities → ${target} (${(JSON.stringify(rows).length / 1024).toFixed(0)} kB)`)
console.log(`  kinds: ${JSON.stringify(kinds)}`)
