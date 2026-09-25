import { getSupabase } from './client'
import { SUPABASE_CONFIGURED } from './config'

import type { IntakeMailState, IntakeNeed, IntakeRequest } from '@core/index'

/**
 * ★★ AQ — LES DEMANDES DE LA PAGE PUBLIQUE, LUES DANS `aid_requests`.
 *
 * ⚠️ HORS DU MAGASIN, COMME `activityReports.ts`, et pour deux raisons :
 *    · la table n'est écrite QUE par le serveur (`submit_aid_request`, et la
 *      fonction Edge `intake-mail` pour l'état des courriels). Dans le
 *      magasin, elle serait réécrite par l'application à chaque mutation
 *      d'une fiche, et un « envoyé » tombé entre deux lectures serait écrasé
 *      par l'ancien « en attente » ;
 *    · ses colonnes `documents` et `signature` portent des fichiers entiers
 *      (775 ko pour la seule demande d'AQ0). On NOMME les colonnes lues : les
 *      documents se lisent déjà sur la fiche (`providedDocuments`).
 *
 * `null` en mode démonstration ou sans session : il n'y a rien à lire, et
 * l'appelant garde ce qu'il avait.
 */
const COLUMNS =
  'id, created_at, need, full_name, phone, email, reference, appointment_at, entity_id, mail_po, mail_farmer, mail_error'

interface Row {
  id: string
  created_at: string
  need: string
  full_name: string | null
  phone: string | null
  email: string | null
  reference: string | null
  appointment_at: string | null
  entity_id: string | null
  mail_po?: string | null
  mail_farmer?: string | null
  mail_error?: string | null
}

const NEEDS: readonly IntakeNeed[] = ['guarding', 'farm_work', 'both']
const MAIL: readonly IntakeMailState[] = ['pending', 'sent', 'failed', 'not_configured', 'skipped']

function mail(value: string | null | undefined): IntakeMailState | null {
  /* `sending` : la fonction Edge a réservé l'envoi et n'a pas encore écrit
     l'issue. Pour le PO, c'est « en route ». */
  if (value === 'sending') return 'pending'
  return MAIL.includes(value as IntakeMailState) ? (value as IntakeMailState) : null
}

export function toIntakeRequest(row: Row): IntakeRequest {
  return {
    id: String(row.id),
    entityId: row.entity_id ?? null,
    createdAt: row.created_at,
    need: NEEDS.includes(row.need as IntakeNeed) ? (row.need as IntakeNeed) : 'guarding',
    reference: row.reference ?? '',
    fullName: row.full_name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    appointmentAt: row.appointment_at ?? null,
    mailPo: mail(row.mail_po),
    mailFarmer: mail(row.mail_farmer),
    mailError: row.mail_error ?? null,
  }
}

export async function loadIntakeRequests(limit = 200): Promise<IntakeRequest[] | null> {
  if (!SUPABASE_CONFIGURED) return null
  const client = await getSupabase()
  if (!client) return null
  const { data: session } = await client.auth.getSession()
  if (!session.session) return null
  const { data, error } = await client
    .from('aid_requests')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return null
  return (data as unknown as Row[]).map(toIntakeRequest)
}

/**
 * ★ AQ3.4 — RENVOYER UN COURRIEL QUI N'EST PAS PARTI. La fonction Edge ne
 *   repart que pour une demande dont l'envoi a échoué ou n'était pas configuré :
 *   l'appeler deux fois n'envoie pas deux messages.
 */
export async function retryIntakeMail(requestId: string): Promise<boolean> {
  if (!SUPABASE_CONFIGURED) return false
  const client = await getSupabase()
  if (!client) return false
  const { error } = await client.functions.invoke('intake-mail', {
    body: { id: requestId, retry: true },
  })
  return !error
}
