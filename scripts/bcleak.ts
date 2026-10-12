import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BC — CE QUE LE COMMIT EMPORTE NE PORTE AUCUNE DONNÉE RÉELLE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run scripts/bcleak.ts        (l'index prêt, avant `git commit`)
 *
 * `bapass` A395 ne lit que les aiguilles de `private/ba/`. Celle-ci les lit
 * dans TOUT `private/` (fiche .vcf d'AW, instantanés de BB et de BC, export
 * du portail…) : chaque numéro de téléphone, chaque numéro à 9 chiffres
 * (ת״ז), chaque NOM de personne (champs de personne des JSON, `FN:` des
 * .vcf) — et cherche chacun dans les lignes AJOUTÉES par l'index (texte
 * seulement). Rien de réel n'est écrit ici ni imprimé : une aiguille
 * trouvée se dit par ses trois premiers caractères et le fichier.
 *
 * ★ Né d'un constat de BC : avec la fiche privée d'AW sur le disque, `awpass`
 *   et `awui` IMPRIMENT un vrai numéro (A340) ; un journal complet de portes
 *   commité l'aurait publié.
 */

const ROOT = 'private'
if (!existsSync(ROOT)) {
  console.log('  (pas de private/ sur cette machine : rien à comparer)')
  process.exit(0)
}

const files: string[] = []
const walk = (d: string): void => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    /* Les journaux de portes rangés dans private/ ne sont pas des SOURCES : ils
       répètent les numéros fictifs des fixtures. */
    else if (/\.(json|csv|vcf|sql|md|txt)$/i.test(e) && st.size < 64 * 1024 * 1024) files.push(p)
  }
}
walk(ROOT)

const numbers = new Set<string>()
const names = new Set<string>()
const PERSON_KEYS = /^(farmer_?name|farmerName|contact_?name|contactName|liaison_?name|liaisonName|reporter_?name|reporterName|signer_?name|signerName|full_?name|fullName|person|name)$/
const isPersonContext = (path: string[]): boolean => path.some((k) => /contact|farmer|person|people|signer|liaison|volunteer|driver|head|member/i.test(k))

function addNumber(raw: string): void {
  const d = raw.replace(/\D/g, '')
  const n = d.startsWith('972') && d.length >= 11 ? d.slice(3) : d.startsWith('0') && d.length >= 9 && d.length <= 10 ? d.slice(1) : d.length === 9 ? d : ''
  /* Les numéros fictifs des fixtures (cinq zéros d'affilée, 1234567) ne sont pas des aiguilles. */
  if (n.length >= 8 && !/00000/.test(n) && !/1234567/.test(n)) numbers.add(n)
}
/* Des libellés de RÔLE qu'une fiche porte parfois à la place d'un nom : ce ne
   sont pas des personnes (« personne de contact », « secrétariat »…). */
const ROLE_WORDS = new Set(['איש קשר', 'אשת קשר', 'אנשי קשר', 'ראש ישיבה', 'ראש הישיבה', 'מזכירות הישיבה'])
function addName(raw: unknown): void {
  if (typeof raw !== 'string') return
  const s = raw.trim().replace(/\s+/g, ' ')
  if (ROLE_WORDS.has(s)) return
  /* Un nom de personne : deux mots au moins, des lettres hébraïques ou latines, pas trop long. */
  if (s.length < 5 || s.length > 40 || !/\s/.test(s) || /\d/.test(s)) return
  if (!/^[֐-׿a-zA-Z"'׳״.\- ]+$/.test(s)) return
  names.add(s)
}
function visit(v: unknown, path: string[]): void {
  if (Array.isArray(v)) v.forEach((x) => visit(x, path))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === 'string' && PERSON_KEYS.test(k) && (k !== 'name' || isPersonContext(path))) addName(x)
      visit(x, [...path, k])
    }
  }
}

for (const f of files) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/(?:\+972|972|0)(?:[\s-]?\d){8,9}/g)) addNumber(m[0])
  for (const m of text.matchAll(/(?<![\d.])\d{9}(?![\d.])/g)) addNumber(m[0])
  if (/\.vcf$/i.test(f)) for (const m of text.matchAll(/^FN:(.+)$/gm)) addName(m[1])
  if (/\.json$/i.test(f)) {
    try {
      visit(JSON.parse(text), [])
    } catch {
      /* pas du JSON valide : seuls les numéros comptent */
    }
  }
}

const variants = (n: string): string[] => {
  if (n.length !== 9 && n.length !== 8) return [n]
  const z = `0${n}`
  return [...new Set([n, z, `${z.slice(0, 3)}-${z.slice(3)}`, `${z.slice(0, 3)}-${z.slice(3, 6)}-${z.slice(6)}`, `${z.slice(0, 2)}-${z.slice(2)}`, `+972${n}`, `972${n}`])]
}

const added = execSync(`git diff --cached HEAD -U0 --no-color -- . ':!*.png' ':!*.jpg' ':!*.jpeg' ':!*.webp' ':!*.xlsx' ':!*.pmtiles' || true`, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
let file = ''
const hits: string[] = []
const byFile = new Map<string, string[]>()
for (const line of added.split('\n')) {
  if (line.startsWith('+++ ')) {
    file = line.slice(6)
    continue
  }
  if (!line.startsWith('+')) continue
  byFile.set(file, [...(byFile.get(file) ?? []), line.slice(1)])
}
for (const [f, lines] of byFile) {
  const text = lines.join('\n')
  for (const n of numbers) if (variants(n).some((v) => text.includes(v))) hits.push(`numéro ${n.slice(0, 3)}… dans ${f}`)
  for (const n of names) if (text.includes(n)) hits.push(`nom « ${n.slice(0, 3)}… » dans ${f}`)
}
console.log(`  ${files.length} fichiers privés lus · ${numbers.size} numéros · ${names.size} noms de personne`)
console.log(`  ${byFile.size} fichier(s) dans l’index`)
if (hits.length) {
  console.log(`  FAIL  ${hits.length} aiguille(s) dans ce que le commit emporte :`)
  for (const h of hits.slice(0, 60)) console.log(`        ${h}`)
  process.exit(1)
}
console.log('  PASS  aucune donnée réelle dans ce que le commit emporte')
