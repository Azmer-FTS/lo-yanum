/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP4 (2026-09-25) — LES TROIS APPELS DE LA PAGE PUBLIQUE, EN `fetch` NU.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ SANS `@supabase/supabase-js`, ET C'EST UN CHOIX DE POIDS, PAS DE GOÛT.
 *    `data/client.ts` explique depuis P2.3 que la bibliothèque pèse ~100 ko
 *    gzippés parce qu'elle emporte postgrest, storage, functions et realtime
 *    « que l'écran s'en serve ou non ». L'application la charge dans un chunk
 *    séparé parce qu'elle en a besoin. Cette page-ci fait TROIS requêtes HTTP,
 *    dont deux sont un POST avec deux en-têtes. 100 ko sur le réseau d'un
 *    téléphone au bout d'un chemin de terre, pour trois `fetch`, ce serait
 *    payer l'abandon du lecteur pour une commodité d'écriture.
 *
 * ⚠️ ET AUCUNE DES TROIS N'EST UNE TABLE. La page n'a AUCUN droit de table :
 *    `anon` a été révoqué partout (`20260925000300`). Ce qu'elle peut faire se
 *    lit ici en entier — trois verbes, et c'est tout ce qui existe.
 *
 * ⚠️ LA CLÉ PUBLIABLE EST DANS LE BUNDLE, ET C'EST NORMAL. Elle NOMME le
 *    projet, elle n'autorise rien : c'est la note de `data/config.ts` depuis
 *    P2.3, et elle est d'autant plus vraie depuis la révocation ci-dessus.
 */

import type { AidRequestDraft } from '@core/request'
import type { BusyInterval } from '@core/availability'

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

/**
 * Vrai quand ce build parle à une vraie base.
 *
 * ★ FAUX EST UN ÉTAT UTILE ET NON UNE PANNE : c'est le jumeau de démonstration
 *   (`/bakasha-demo/`), qui sert aux captures et aux portes d'interface. La
 *   page se comporte alors exactement pareil, sauf que l'envoi ne part pas.
 */
export const CONFIGURED = URL_BASE !== '' && KEY !== ''

async function rpc<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      /* Sans cela PostgREST rend une liste pour une fonction scalaire. */
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `http_${res.status}`
    try {
      const payload = (await res.json()) as { message?: string }
      if (typeof payload.message === 'string' && payload.message !== '')
        message = payload.message
    } catch {
      /* Un corps illisible ne doit pas masquer le code d'état. */
    }
    throw new RpcError(message)
  }
  return (await res.json()) as T
}

/**
 * ★ L'ERREUR PORTE LE MOT QUE LA BASE A LEVÉ (`phone`, `documentSize`,
 *   `appointmentTaken`, `tooMany`…), pas une phrase. La page le traduit ; le
 *   transport ne décide pas de ce que le lecteur lit.
 */
export class RpcError extends Error {}

// ---------------------------------------------------------------------------

/** Les créneaux DÉJÀ PRIS dans l'agenda du PO, sans dire par qui. */
export async function loadBusy(from: Date, days: number): Promise<BusyInterval[]> {
  if (!CONFIGURED) return []
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
  const rows = await rpc<{ starts_at: string; ends_at: string }[]>(
    'public_busy_intervals',
    { from_at: from.toISOString(), to_at: to.toISOString() },
  )
  return rows.map((r) => ({ startAt: r.starts_at, endAt: r.ends_at }))
}

/**
 * Le gabarit que le PO a enregistré dans ses réglages, ou `null` s'il n'en a
 * enregistré aucun — auquel cas c'est le texte LIVRÉ qui fait foi, et les deux
 * builds sortent du même dépôt donc c'est le même (AP3.5, AH5).
 */
export async function loadAgreementTemplate(): Promise<string | null> {
  if (!CONFIGURED) return null
  const value = await rpc<string | null>('public_agreement_template', {})
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export interface SubmitResult {
  ok: true
  reference: string
}

/** Déposer la demande. Ce qui revient ne porte que la référence. */
export async function submitRequest(draft: AidRequestDraft): Promise<SubmitResult> {
  if (!CONFIGURED) {
    /* Le jumeau de démonstration : la page va jusqu'au bout, rien ne part, et
       la référence le DIT. Une fausse référence d'allure vraie ferait croire
       à une capture qu'une demande a été déposée. */
    return { ok: true, reference: 'DEMO' }
  }
  return await rpc<SubmitResult>('submit_aid_request', {
    payload: {
      need: draft.need,
      landKind: draft.landKind,
      farmName: draft.farmName.trim(),
      fullName: draft.fullName.trim(),
      idNumber: draft.idNumber.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      locality: draft.locality.trim(),
      documents: draft.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        file: d.file,
        ...(d.pages === undefined ? {} : { pages: d.pages }),
      })),
      signature: draft.signature,
      appointmentAt: draft.appointmentAt,
      appointmentEndAt: draft.appointmentEndAt,
    },
  })
}
