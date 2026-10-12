import { readFileSync, writeFileSync } from 'node:fs'

import { normalizeBranches } from '../src/core/branches'
import type { FarmBranchKind } from '../src/core/branches'
import { nearestLocalityName } from '../src/core/nearestLocality'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BC — LES DONNÉES, EN SQL GARDÉ (rien de réel dans ce fichier).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run scripts/bcdata.ts      → private/bc/data.sql (ignoré par git)
 *
 * Lit `private/bc/avant/farms.json` (instantané relu AVANT écriture) et
 * `private/bc/plan.json` (les décisions du brief), et écrit UN bloc qui :
 *
 *   · range la localité de repère CALCULÉE de chaque ferme placée — par la
 *     MÊME fonction que l'application (`nearestLocalityName`, sur la liste de
 *     `LocalityField`) — jamais par-dessus une valeur saisie ;
 *   · saisit celle des cinq fermes sans point (marquées « saisies ») ;
 *   · pré-remplit la nature (drapeau « à confirmer » levé) des onze fermes et
 *     des sept contacts à traiter, seulement là où rien n'est encore dit ;
 *   · retire l'alias faux de ישיבת שדות נגב (seulement si la valeur est celle
 *     relue) ;
 *   · marque la note du contact de tête de ישיבת דרך חיים comme restreignant
 *     l'usage de son téléphone.
 *
 * ★ CHAQUE INSTRUCTION DOIT TOUCHER EXACTEMENT UNE LIGNE, sinon tout est
 *   annulé (`raise exception`) : une fiche modifiée entre la lecture et
 *   l'écriture n'est jamais écrasée en silence (règle 9bis d'AO).
 */

interface Snap {
  id: string
  name: string
  lat: number
  lng: number
  position_missing: boolean
}
interface Plan {
  manualLocalities: Record<string, string>
  farmBranches: Record<string, FarmBranchKind[]>
  leadBranches: Record<string, FarmBranchKind[]>
  alias: { id: string; before: string; after: string }
  restrictContact: { institution: string; contact: string }
}

const farms = JSON.parse(readFileSync('private/bc/avant/farms.json', 'utf8')) as Snap[]
const plan = JSON.parse(readFileSync('private/bc/plan.json', 'utf8')) as Plan
const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const branchJson = (kinds: FarmBranchKind[]) => q(JSON.stringify(normalizeBranches(kinds.map((kind) => ({ kind, toConfirm: true })))))

const stmts: Array<{ label: string; sql: string }> = []
const computed: Array<{ id: string; name: string; near: string }> = []
for (const f of farms) {
  if (f.position_missing) continue
  const near = nearestLocalityName({ lat: f.lat, lng: f.lng })
  if (!near) throw new Error(`aucune localité pour ${f.id}`)
  computed.push({ id: f.id, name: f.name, near })
  stmts.push({
    label: `repère calculé ${f.id}`,
    sql: `update public.entities set nearest_locality = ${q(near)} where id = ${q(f.id)} and position_missing = false and nearest_locality_manual = false and (nearest_locality is null or nearest_locality = ${q(near)})`,
  })
}
for (const [id, name] of Object.entries(plan.manualLocalities)) {
  const f = farms.find((x) => x.id === id)
  if (!f || !f.position_missing) throw new Error(`${id} : attendue SANS point`)
  stmts.push({
    label: `repère saisi ${id}`,
    sql: `update public.entities set nearest_locality = ${q(name)}, nearest_locality_manual = true where id = ${q(id)} and position_missing = true and nearest_locality_manual = false and nearest_locality is null`,
  })
}
for (const [id, kinds] of Object.entries(plan.farmBranches)) {
  if (!farms.some((x) => x.id === id)) throw new Error(`${id} : ferme inconnue`)
  stmts.push({ label: `nature ferme ${id}`, sql: `update public.entities set branches = ${branchJson(kinds)}::jsonb where id = ${q(id)} and branches = '[]'::jsonb` })
}
for (const [id, kinds] of Object.entries(plan.leadBranches)) {
  stmts.push({ label: `nature piste ${id}`, sql: `update public.leads set branches = ${branchJson(kinds)}::jsonb where id = ${q(id)} and branches = '[]'::jsonb and converted_farm_id is null` })
}
stmts.push({ label: 'alias retiré', sql: `update public.institutions set aliases = ${q(plan.alias.after)} where id = ${q(plan.alias.id)} and aliases = ${q(plan.alias.before)}` })
stmts.push({
  label: 'contact au téléphone restreint',
  sql:
    `update public.institutions set contacts = (select jsonb_agg(case when c->>'id' = ${q(plan.restrictContact.contact)} then c || '{"restrictsCalls": true}'::jsonb else c end order by ord) from jsonb_array_elements(contacts) with ordinality as t(c, ord)) ` +
    `where id = ${q(plan.restrictContact.institution)} and exists (select 1 from jsonb_array_elements(contacts) c where c->>'id' = ${q(plan.restrictContact.contact)} and coalesce((c->>'restrictsCalls')::boolean, false) = false)`,
})

const body = stmts
  .map((s) => `  ${s.sql};\n  get diagnostics n = row_count;\n  if n <> 1 then raise exception 'BC — % : % ligne(s), attendu 1', ${q(s.label)}, n; end if;`)
  .join('\n')
const sql = `-- BC — données (générées par scripts/bcdata.ts ; privé, jamais commité)\ndo $$\ndeclare n integer;\nbegin\n${body}\nend $$;\n`
writeFileSync('private/bc/data.sql', sql)
writeFileSync('private/bc/reperes-calcules.json', JSON.stringify(computed, null, 2))
console.log(`  ${stmts.length} instructions → private/bc/data.sql`)
console.log(`  ${computed.length} repères calculés, ${Object.keys(plan.manualLocalities).length} saisis, ${Object.keys(plan.farmBranches).length} natures de ferme, ${Object.keys(plan.leadBranches).length} de pistes, 1 alias, 1 contact`)
