import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'

import type { ActivityReportRecord } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AO3.6 (2026-09-24) — LES RAPPORTS ENVOYÉS, RATTACHÉS AU COMPTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Même forme et mêmes raisons que `data/settings.ts` (AH11.2) : un module
 * court qui transporte des lignes, avec le local en cache pour le hors-ligne.
 * La différence est qu'il y a PLUSIEURS lignes par compte — c'est un journal,
 * pas un réglage — d'où le `limit` et le tri décroissant.
 *
 * ⚠️ CE MODULE NE DÉCIDE RIEN. Il ne choisit pas le rapport précédent, ne
 *    calcule aucun écart et ne met rien en forme : `core/activity.ts` fait
 *    l'un et `ui/report/activityHistory.ts` fait l'autre. Ici, on écrit et on
 *    relit.
 *
 * ⚠️ ET IL NE JETTE JAMAIS. Une écriture qui échoue rend `false` ; c'est
 *    l'appelant qui garde la copie locale — sinon le PO perdrait le rapport
 *    qu'il vient d'envoyer parce que le train est passé sous un tunnel.
 */

/** La ligne telle que Postgres la porte. */
interface Row {
  id: string
  period_from: string
  period_to: string
  generated_at: string
  previous_id: string | null
  payload: unknown
  body: string
}

function toRecord(row: Row): ActivityReportRecord | null {
  const payload = row.payload as Partial<ActivityReportRecord> | null
  if (!payload || typeof payload !== 'object' || !payload.totals || !payload.farms) return null
  return {
    id: row.id,
    period: {
      id: payload.period?.id ?? 'custom',
      from: row.period_from,
      to: row.period_to,
    },
    generatedAt: row.generated_at,
    previousId: row.previous_id,
    totals: payload.totals,
    farms: payload.farms,
    body: row.body,
  }
}

export async function loadRemoteActivityReports(
  limit = 24,
): Promise<ActivityReportRecord[] | null> {
  if (!SUPABASE_CONFIGURED) return null
  const client = await getSupabase()
  if (!client) return null
  const { data: user } = await client.auth.getUser()
  const id = user.user?.id
  if (!id) return null
  const { data, error } = await client
    .from('activity_reports')
    .select('id, period_from, period_to, generated_at, previous_id, payload, body')
    .eq('user_id', id)
    .order('period_to', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(limit)
  if (error || !data) return null
  return (data as Row[]).map(toRecord).filter((r): r is ActivityReportRecord => r !== null)
}

/**
 * ⚠️ `upsert` ET `user_id` ÉCRIT EXPLICITEMENT, pour la même raison que dans
 *    `data/settings.ts` : la politique d'insertion exige `user_id = auth.uid()`
 *    et un `upsert` sans la colonne serait refusé au premier rapport d'un
 *    compte neuf — c'est-à-dire exactement le cas que ce module sert.
 */
export async function saveRemoteActivityReport(
  record: ActivityReportRecord,
): Promise<boolean> {
  if (!SUPABASE_CONFIGURED) return false
  const client = await getSupabase()
  if (!client) return false
  const { data: user } = await client.auth.getUser()
  const id = user.user?.id
  if (!id) return false
  const { error } = await client.from('activity_reports').upsert(
    {
      id: record.id,
      user_id: id,
      period_from: record.period.from,
      period_to: record.period.to,
      generated_at: record.generatedAt,
      previous_id: record.previousId,
      payload: {
        period: record.period,
        totals: record.totals,
        farms: record.farms,
      },
      body: record.body,
    },
    { onConflict: 'id' },
  )
  return !error
}
