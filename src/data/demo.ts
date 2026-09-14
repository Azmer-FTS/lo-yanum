import { COLLECTIONS } from '@core/backend'
import type { Collection } from '@core/backend'
import { _raw, purgeTestData, testDataCount } from '@core/store'
import { TEST_PREFIX, isTestId } from '@core/testData'

import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'
import { MAPPINGS } from './rows'
import type { Mapping } from './rows'
import { clearLocalData, flushPending, refreshData } from './store'

/**
 * ORDRE DE NUIT 2026-09-02 (N3) — THE DEMO DATASET'S MARKER, AND ITS PURGE.
 *
 * ★ THE MARKER IS THE ID PREFIX `demo-`, on every aggregate of the demo
 *   dataset (`scripts/demo-data.ts`). Every child row hangs off one of them by
 *   a foreign key declared `on delete cascade`, so removing the whole dataset
 *   is twelve statements — one per aggregate root, parents deleted in reverse
 *   dependency order — and nothing else. Ids minted by the app (`nextId`)
 *   never carry that prefix, so the product owner's own entity, his settings
 *   and anything he creates from now on are untouched by construction.
 *
 * ★ AND IT NEVER LOOKS INTO THE BUCKETS. The demo portraits are
 *   `placeholder:` markers rendered on the device (`photoSource`), not
 *   objects in `photos`; the demo agreements name files that were never
 *   uploaded. There is nothing of the dataset's in storage to remove.
 *
 * Runs through the app's own signed-in client, under the coordinator's RLS
 * (`for all`), then re-hydrates so the screens show the emptied programme
 * without a reload.
 */

export const DEMO_PREFIX = 'demo-'

export const isDemoId = (id: string): boolean => id.startsWith(DEMO_PREFIX)

/** How much of what is on screen is demo data — for הגדרות to print. */
/* ⚠️ AI8 — `purgeDemoData` n'existe plus : un geste qui ne prend que `demo-`
   est précisément ce qui a laissé le jeu d'essai derrière. */
export function demoCounts(): { entities: number; volunteers: number; missions: number; total: number } {
  const data = _raw()
  const count = (c: Collection) => (data[c] as Array<{ id: string }>).filter((r) => isDemoId(r.id)).length
  const total = COLLECTIONS.reduce((s, c) => s + count(c), 0)
  return { entities: count('farms'), volunteers: count('volunteers'), missions: count('missions'), total }
}

/** The parent tables, in the order the purge deletes them. */
export const DEMO_PURGE_TABLES: string[] = [...COLLECTIONS]
  .reverse()
  .map((c) => (MAPPINGS[c] as Mapping<unknown>).table)

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AI8 (2026-09-14) — « J'AI SUPPRIMÉ LES DONNÉES ET IL RESTE UNE FERME, UN
 *    VOLONTAIRE ET UN CONDUCTEUR ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REGARDÉ, PAS DEVINÉ. Sur `lo-yanum-prod`, le 2026-09-14 : `entities`
 * `test-farm`, `volunteers` `test-vol`, `drivers` `test-drv`, deux gardes
 * `test-mission-*`, la zone, le poste et l'accord signé — TOUTES les lignes
 * métier de la base portent `test-`. C'est le jeu d'essai d'AH3, posé le
 * 2026-09-10 à 20:47 UTC. Aucun reliquat de la remise à zéro d'AF8. Et les
 * journaux de l'API ne montrent AUCUNE requête de suppression de ces lignes
 * entre leur pose et aujourd'hui.
 *
 * ⚠️★★ LA CAUSE EST L'ÉCRAN, PAS LA BASE. Il y avait DEUX sections : « נתוני
 *    הדגמה », dont le bouton s'appelait « מחק את כל נתוני ההדגמה » et ne
 *    visait que `demo-`, et « נתוני בדיקה », REPLIÉE par défaut depuis AH12.
 *    Aucun geste de l'écran ne pouvait emporter les deux. Un bouton qui dit
 *    « tout » et qui ne prend pas tout fabrique exactement des données dont
 *    on ignore l'origine.
 *
 * ★ UN SEUL GESTE, DEUX MARQUEURS, ET TOUJOURS RIEN D'AUTRE. Ce que le PO crée
 *   lui-même (`nextId`) ne porte ni `demo-` ni `test-` : il survit par
 *   construction, comme en N3.
 *
 * ★ PAR LE SERVEUR DIRECTEMENT, PAS PAR LA FILE D'ATTENTE. Le retrait du jeu
 *   d'essai passait par `commit()` → file d'envoi : un appareil sans réseau le
 *   voyait disparaître de l'écran, puis la prochaine hydratation le ramenait.
 *   Ici la suppression est une requête, son échec est une erreur affichée, et
 *   le résultat est RECOMPTÉ sur le serveur après coup.
 */
export const SAMPLE_PREFIXES = [DEMO_PREFIX, TEST_PREFIX] as const

export const isSampleId = (id: string): boolean => isDemoId(id) || isTestId(id)

export interface SamplePurgeResult {
  removed: number
  /** Lignes marquées encore présentes sur le SERVEUR après la suppression. */
  remaining: number
}

export async function purgeSampleData(): Promise<SamplePurgeResult> {
  if (!SUPABASE_CONFIGURED) return { removed: purgeTestData().removed, remaining: testDataCount() }
  const client = await getSupabase()
  if (!client) throw new Error('no client')
  /* ⚠️ D'ABORD CE QUI ATTEND D'ÊTRE ENVOYÉ. Un jeu d'essai posé il y a deux
     secondes est peut-être encore dans la file : supprimer sur le serveur
     puis laisser la file le réécrire recréerait exactement le défaut. */
  await flushPending()
  let removed = 0
  for (const table of DEMO_PURGE_TABLES) {
    for (const prefix of SAMPLE_PREFIXES) {
      const { error, count } = await client
        .from(table)
        .delete({ count: 'exact' })
        .like('id', `${prefix}%`)
      if (error) throw new Error(`${table}: ${error.message}`)
      removed += count ?? 0
    }
  }
  /* ★ Z7.2 — and the device with it. The rows are gone from Frankfurt; the
     snapshot of them in IndexedDB and any queued write against them are what
     would put the programme back on the next cold start. */
  await clearLocalData()
  await refreshData()
  /* ★ AI8.4 — VÉRIFIÉ, PAS SUPPOSÉ : on redemande au serveur. */
  let remaining = 0
  for (const table of DEMO_PURGE_TABLES) {
    for (const prefix of SAMPLE_PREFIXES) {
      const { error, count } = await client
        .from(table)
        .select('id', { count: 'exact', head: true })
        .like('id', `${prefix}%`)
      if (error) throw new Error(`${table}: ${error.message}`)
      remaining += count ?? 0
    }
  }
  return { removed, remaining }
}
