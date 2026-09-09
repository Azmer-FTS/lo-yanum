import { SUPABASE_CONFIGURED } from '../../data/config'
import type { SettingsBlob } from '../../data/settings'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH11.2 (2026-09-10) — CE QUI VOYAGE D'UN APPAREIL À L'AUTRE, ET CE QUI
 *    NE VOYAGE PAS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Les réglages, régions et gabarits du PO vivent dans le navigateur. Un
 *     changement d'appareil ou un nettoyage de Safari les perd. »
 *
 * ★★ LA LISTE EST FERMÉE ET ÉCRITE À LA MAIN, ET C'EST LA DÉCISION DU BLOC.
 *    Le raccourci évident — « tout ce qui commence par `lo-yanum:` » — aurait
 *    emporté avec lui le laissez-passer de l'agriculteur (`farmerPass`), la
 *    mémoire de temporisation d'AG2 et le pli de chaque bloc. Les deux
 *    premiers sont des faits d'APPAREIL dont la copie sur un autre appareil
 *    annulerait la protection qu'ils sont ; le troisième est une disposition
 *    d'écran qui n'a de sens que sur l'écran choisi.
 */
export const SYNCED_SETTING_KEYS: readonly string[] = [
  /* Le programme : cible, seuils, couvertures, rappels. */
  'lo-yanum:target',
  'lo-yanum:coverage',
  'lo-yanum:vigil',
  'lo-yanum:reminders',
  'lo-yanum:renewal-window',
  'lo-yanum:area-gap',
  'lo-yanum:require-id-photo',
  /* Les gabarits (AE4 · AH5). */
  'lo-yanum:summons-template',
  'lo-yanum:agreement-doc-template',
  'lo-yanum:agreement-doc-logo',
  /* Les régions redessinées (Y2). */
  'lo-yanum:region-rings',
  /* L'identité du coordinateur, qui signe chaque message. */
  'lo-yanum:coordinator',
  /* Le point de départ des tournées, et les tournées libres (AH9). */
  'lo-yanum:origin',
  'lo-yanum:free-routes',
]

/** Ce que l'appareil porte aujourd'hui, pour les clés qui voyagent. */
export function snapshotSettings(): SettingsBlob {
  const out: SettingsBlob = {}
  for (const key of SYNCED_SETTING_KEYS) {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) out[key] = v
    } catch {
      /* Navigation privée : rien à envoyer. */
    }
  }
  return out
}

/**
 * ★★ APPLIQUÉ AVANT QUE QUOI QUE CE SOIT NE RENDE, ET C'EST CE QUI ÉVITE UN
 *    REFACTOR DE DOUZE MODULES.
 *
 * Chaque module de réglage garde sa valeur dans un cache de portée module,
 * rempli à la PREMIÈRE lecture. Écrire dans `localStorage` avant que le
 * premier écran ne monte suffit donc à ce que tous lisent la bonne valeur,
 * sans qu'aucun n'ait à savoir qu'un serveur existe. Appliqué plus tard, il
 * aurait fallu un registre d'invalidation dans les douze.
 *
 * ⚠️ ET LE SERVEUR GAGNE AU DÉMARRAGE, PAS À CHAQUE INSTANT. C'est la lecture
 *    d'AH11.2 : « côté serveur, avec le LOCAL EN CACHE pour le hors-ligne ».
 *    Le cache sert quand le réseau manque ; quand le réseau répond, la vérité
 *    est celle du compte. Une fusion clé par clé aurait demandé un horodatage
 *    par réglage et aurait rendu « pourquoi ce chiffre a-t-il changé » sans
 *    réponse.
 */
export function applySettings(blob: SettingsBlob): number {
  let applied = 0
  for (const key of SYNCED_SETTING_KEYS) {
    const v = blob[key]
    if (typeof v !== 'string') continue
    try {
      if (localStorage.getItem(key) !== v) applied += 1
      localStorage.setItem(key, v)
    } catch {
      /* Idem. */
    }
  }
  return applied
}

// ---------------------------------------------------------------------------
// L'écriture, en différé
// ---------------------------------------------------------------------------

let timer: number | null = null
let pushing = false

/**
 * ★★ L'ÉCRITURE EST DÉCLENCHÉE PAR `localStorage.setItem` LUI-MÊME, ET C'EST
 *    LE SEUL ENDROIT DU PROGRAMME QUI ENVELOPPE UNE FONCTION DU NAVIGATEUR.
 *
 * ⚠️ POURQUOI CE CHOIX PLUTÔT QUE D'APPELER `pushSettings()` DEPUIS LES DOUZE
 *    MODULES : parce que le treizième ne l'appellerait pas. Une règle qui
 *    demande d'ajouter une ligne à chaque nouveau réglage est une règle qui
 *    aura un trou, et le trou serait silencieux — le PO découvrirait sur un
 *    autre iPad qu'un seul de ses réglages n'a pas suivi. Ici la règle est
 *    « ce qui est dans la liste voyage », et elle n'a qu'un endroit.
 *
 * ⚠️ ET L'ENVELOPPE EST TRANSPARENTE : elle appelle l'original, ne jette
 *    jamais, et ne fait rien du tout hors d'un build réel connecté.
 */
export function startSettingsSync(push: (blob: SettingsBlob) => Promise<boolean>): void {
  if (!SUPABASE_CONFIGURED) return
  const original = window.localStorage.setItem.bind(window.localStorage)
  const watched = new Set(SYNCED_SETTING_KEYS)
  window.localStorage.setItem = (key: string, value: string): void => {
    original(key, value)
    if (!watched.has(key)) return
    if (timer !== null) window.clearTimeout(timer)
    /* 1,2 s : le PO tape dans une zone de texte de gabarit, et une écriture
       par frappe serait une requête par frappe. */
    timer = window.setTimeout(() => {
      timer = null
      if (pushing) return
      pushing = true
      void push(snapshotSettings()).finally(() => {
        pushing = false
      })
    }, 1200)
  }
}
