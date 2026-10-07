import { readFileSync, writeFileSync } from 'node:fs'

import { parsePortalCsv, planPortalImport, portalPlanSummary } from '../src/core/portalImport'
import type { Farm, PortalPlan } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS1 — LA REPRISE DE L'EXPORT DU PORTAIL SUR `lo-yanum-prod`, EN SQL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run asdata                → affiche le plan (le MÊME que l'écran d'import)
 *   bun run asdata sql <out.sql>  → écrit la reprise
 *
 * Entrées (HORS DÉPÔT — le dépôt est PUBLIC, et ce fichier porte des
 * signatures et des ת״ז) :
 *   AS_CSV  = private/portal-export-2026-10-07.csv   l'export, tel quel
 *   AS_DB   = private/as-db-avant.json               la base RELUE avant d'écrire
 *   AS_SIGNED = 16,22   lignes dont le statut « נחתם » est confirmé à l'écran
 *                       du portail (le CSV n'a pas de colonne de statut)
 *
 * ★ LE SQL RE-GARDE CHAQUE RÉGIME : même relue juste avant, la base peut avoir
 *   bougé entre la lecture et l'application. « Comble un vide » est un
 *   `coalesce(nullif(col,''), val)`, la position un `case when
 *   position_missing`, la signature un `coalesce(signature, val)`. Une
 *   conversion fiche → piste ne supprime la fiche QUE si rien n'y est
 *   rattaché (sept tables vérifiées dans le `delete`).
 */

const CSV = process.env.AS_CSV ?? 'private/portal-export-2026-10-07.csv'
const DB = process.env.AS_DB ?? 'private/as-db-avant.json'
const SIGNED = new Set((process.env.AS_SIGNED ?? '').split(',').filter(Boolean).map(Number))

interface DbRow {
  id: string
  name: string
  status: Farm['status']
  farmer_name: string | null
  farmer_phone: string | null
  farmer_id_no: string | null
  farmer_email: string | null
  lat: number
  lng: number
  position_missing: boolean
  farm_dunams: number
  grazing_dunams: number
  notes: string
}

export function farmsFromDb(rows: DbRow[]): Farm[] {
  return rows.map(
    (r) =>
      ({
        id: r.id,
        name: r.name,
        status: r.status,
        farmerName: r.farmer_name ?? undefined,
        farmerPhone: r.farmer_phone ?? undefined,
        farmerId: r.farmer_id_no ?? undefined,
        farmerEmail: r.farmer_email ?? undefined,
        position: { lat: r.lat, lng: r.lng },
        positionMissing: r.position_missing,
        farmDunams: r.farm_dunams,
        grazingDunams: r.grazing_dunams,
        notes: r.notes,
        locality: '',
      }) as unknown as Farm,
  )
}

export function buildPlan(): PortalPlan {
  return planPortalImport({
    matrix: parsePortalCsv(readFileSync(CSV, 'utf8')),
    farms: farmsFromDb(JSON.parse(readFileSync(DB, 'utf8')) as DbRow[]),
    leads: [],
    fileName: CSV.split('/').pop() ?? 'portal.csv',
    nowIso: '2026-10-07T12:00:00.000Z',
  })
}

const q = (v: string | null | undefined): string => (v == null ? 'null' : `'${v.replace(/'/gu, "''")}'`)

export function planSql(plan: PortalPlan): string {
  const out: string[] = ['-- AS1 — reprise de l\'export du portail (généré par scripts/asdata.ts)', 'begin;']
  for (const a of plan.actions) {
    if (a.kind === 'update') {
      const p = a.patch
      const set: string[] = []
      if (p.name !== undefined) set.push(`name = ${q(p.name)}`)
      if (p.farmDunams !== undefined) set.push(`farm_dunams = ${p.farmDunams}`, `farm_dunams_manual = ${p.farmDunamsManual === true}`)
      if (p.grazingDunams !== undefined) set.push(`grazing_dunams = ${p.grazingDunams}`, `grazing_dunams_manual = ${p.grazingDunamsManual === true}`)
      if (p.type !== undefined) set.push(`type = ${q(p.type)}`)
      if (p.status !== undefined || SIGNED.has(a.row.line)) {
        set.push(`status = case when status in ('signed','active') then status else ${q(p.status ?? 'signed')}::farm_status end`)
      }
      if (p.farmerName) set.push(`farmer_name = coalesce(nullif(farmer_name, ''), ${q(p.farmerName)})`)
      if (p.farmerPhone) set.push(`farmer_phone = coalesce(nullif(farmer_phone, ''), ${q(p.farmerPhone)})`)
      if (p.farmerId) set.push(`farmer_id_no = coalesce(nullif(farmer_id_no, ''), ${q(p.farmerId)})`)
      if (p.farmerEmail) set.push(`farmer_email = coalesce(nullif(farmer_email, ''), ${q(p.farmerEmail)})`)
      if (p.position) {
        set.push(
          `lat = case when position_missing then ${p.position.lat} else lat end`,
          `lng = case when position_missing then ${p.position.lng} else lng end`,
          `position_missing = false`,
        )
      }
      if (p.signature) {
        set.push(
          `signature_origin = case when signature is null then ${q(JSON.stringify(p.signatureOrigin))} else signature_origin end`,
          `signature_missing = case when signature is null then false else signature_missing end`,
          `signature = coalesce(signature, ${q(p.signature)})`,
        )
      }
      if (p.landDocuments) {
        const fresh = p.landDocuments.filter((d) => d.status === 'pending')
        set.push(
          `land_documents = coalesce(land_documents, '[]'::jsonb) || (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(${q(JSON.stringify(fresh))}::jsonb) d where not coalesce(land_documents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('url', d->'url')))`,
        )
      }
      if (set.length === 0) continue
      set.push('updated_at = now()')
      out.push(`-- ligne ${a.row.line} · ${a.row.name} (apparié par ${a.pairedBy})`)
      out.push(`update public.entities set\n  ${set.join(',\n  ')}\nwhere id = ${q(a.farmId)};`)
    } else if (a.kind === 'farm-to-lead') {
      const l = a.lead
      const id = `lead-as-${a.farmId.replace(/^farm-/u, '')}`
      const guard = ['agreements', 'aid_requests', 'entity_commitments', 'entity_contacts', 'entity_livestock', 'farm_visits', 'guard_posts', 'incidents', 'missions', 'threat_vectors', 'threat_zones', 'tour_stops', 'zones']
        .map((t) => `not exists (select 1 from public.${t} x where x.entity_id = ${q(a.farmId)})`)
        .join('\n    and ')
      out.push(`-- ligne ${a.row.line} · ${a.row.name} : fiche ${a.farmId} → piste`)
      out.push(
        `insert into public.leads (id, name, contact_name, phone, place, lat, lng, region_id, status, notes, source, raw, rank)\n` +
          `select ${q(id)}, ${q(l.name)}, ${q(l.contactName)}, ${q(l.phone)}, ${q(l.place)}, ${l.position?.lat ?? 'null'}, ${l.position?.lng ?? 'null'}, ${q(l.regionId)}, ${q(l.status)}, ${q(l.notes)}, 'farm', ${q(l.raw)}, 0\n` +
          `where exists (select 1 from public.entities where id = ${q(a.farmId)})\non conflict (id) do nothing;`,
      )
      out.push(`delete from public.entities where id = ${q(a.farmId)}\n    and ${guard};`)
    } else if (a.kind === 'lead-create') {
      const l = a.lead
      const id = `lead-as-l${a.row.line}`
      out.push(`-- ligne ${a.row.line} · ${a.row.name} : piste neuve`)
      out.push(
        `insert into public.leads (id, name, contact_name, phone, place, lat, lng, region_id, status, notes, source, raw, rank)\n` +
          `values (${q(id)}, ${q(l.name)}, ${q(l.contactName)}, ${q(l.phone)}, ${q(l.place)}, ${l.position?.lat ?? 'null'}, ${l.position?.lng ?? 'null'}, null, ${q(l.status)}, ${q(l.notes)}, 'portal', ${q(l.raw)}, 0)\non conflict (id) do nothing;`,
      )
    } else if (a.kind === 'create-farm') {
      throw new Error(`création de ferme non prévue par cette reprise : ${a.row.name}`)
    }
  }
  out.push('commit;')
  return out.join('\n\n') + '\n'
}

if (import.meta.main) {
  const plan = buildPlan()
  if (process.argv[2] === 'sql') {
    const file = process.argv[3] ?? 'private/as1-prod.sql'
    writeFileSync(file, planSql(plan))
    console.log(`écrit : ${file}`)
  }
  console.log(portalPlanSummary(plan))
  for (const w of plan.warnings) console.log(`  ⚠ l.${w.line} ${w.name} — ${w.code} — ${w.detail}`)
}
