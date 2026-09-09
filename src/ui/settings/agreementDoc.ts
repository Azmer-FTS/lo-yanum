import { useSyncExternalStore } from 'react'

import { unknownAgreementVars } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH5 (2026-09-09) — LE GABARIT DU DOCUMENT ET SON LOGO, RÉGLABLES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Même forme que `settings/summons.ts` — les
 * gabarits du programme se règlent tous de la même façon —, avec deux
 * différences qui viennent du brief :
 *
 * ★ LE REFUS NOMME LA VARIABLE FAUTIVE (AH5.7) plutôt que la variable
 *   MANQUANTE. Ce n'est pas la même porte : `{{year}}` était obligatoire dans
 *   le הצהרה d'AF1, alors qu'ici les sept sont facultatives — un document qui
 *   n'en emploie aucune est un document valable. Ce qui est refusé, c'est un
 *   jeton qui n'existe pas, parce que celui-là s'imprimerait tel quel.
 *
 * ★ LE LOGO EST UNE VALEUR INITIALE, JAMAIS UN LOGO IMPOSÉ (AH5.5). « Celui de
 *   l'association est le logo INITIAL. Le PO ne doit à aucun moment être coincé
 *   avec un document standard. » `null` veut donc dire « celui d'ארצנו », et
 *   non « pas de logo » ; l'effacer explicitement est un troisième état, écrit
 *   `''`, et c'est ce qui produit un document sans aucune marque.
 */

const TEMPLATE_KEY = 'lo-yanum:agreement-doc-template'
const LOGO_KEY = 'lo-yanum:agreement-doc-logo'

export type LogoAlign = 'start' | 'center' | 'end'

export interface AgreementLogo {
  /**
   * `null` = celui de l'association (la valeur initiale).
   * `''`   = aucun logo, choisi exprès.
   * sinon  = l'image téléversée, en URL de données.
   */
  src: string | null
  align: LogoAlign
  /** Largeur sur la page, en points PDF. 60 → 300. */
  width: number
}

export const DEFAULT_LOGO: AgreementLogo = { src: null, align: 'center', width: 150 }
export const LOGO_MIN = 60
export const LOGO_MAX = 300

const listeners = new Set<() => void>()
const notify = (): void => {
  for (const l of listeners) l()
}

// --- le texte ---------------------------------------------------------------

let templateCache: string | null | undefined

export function readTemplateOverride(): string | null {
  if (templateCache === undefined) {
    try {
      templateCache = localStorage.getItem(TEMPLATE_KEY)
    } catch {
      templateCache = null
    }
  }
  return templateCache
}

/** Le gabarit en vigueur : la surcharge, sinon celui qui est livré. */
export function agreementTemplate(shipped: string): string {
  return readTemplateOverride() ?? shipped
}

export type TemplateSaveResult = { ok: true } | { ok: false; unknown: string[] }

export function writeAgreementTemplate(next: string): TemplateSaveResult {
  const unknown = unknownAgreementVars(next)
  if (unknown.length > 0) return { ok: false, unknown }
  templateCache = next
  try {
    localStorage.setItem(TEMPLATE_KEY, next)
  } catch {
    // Navigation privée : le gabarit s'applique, il ne survit pas à l'onglet.
  }
  notify()
  return { ok: true }
}

export function resetAgreementTemplate(): void {
  templateCache = null
  try {
    localStorage.removeItem(TEMPLATE_KEY)
  } catch {
    /* idem */
  }
  notify()
}

// --- le logo ----------------------------------------------------------------

let logoCache: AgreementLogo | undefined

export function readAgreementLogo(): AgreementLogo {
  if (logoCache === undefined) {
    try {
      const raw = localStorage.getItem(LOGO_KEY)
      logoCache = raw ? sanitise(JSON.parse(raw) as Partial<AgreementLogo>) : DEFAULT_LOGO
    } catch {
      logoCache = DEFAULT_LOGO
    }
  }
  return logoCache
}

function sanitise(v: Partial<AgreementLogo>): AgreementLogo {
  const align: LogoAlign =
    v.align === 'start' || v.align === 'end' || v.align === 'center' ? v.align : 'center'
  const width = Number.isFinite(v.width)
    ? Math.min(LOGO_MAX, Math.max(LOGO_MIN, Math.round(Number(v.width))))
    : DEFAULT_LOGO.width
  const src = typeof v.src === 'string' ? v.src : null
  return { src, align, width }
}

export function writeAgreementLogo(patch: Partial<AgreementLogo>): AgreementLogo {
  const next = sanitise({ ...readAgreementLogo(), ...patch })
  logoCache = next
  try {
    localStorage.setItem(LOGO_KEY, JSON.stringify(next))
  } catch {
    /* idem */
  }
  notify()
  return next
}

/** Retour à l'état livré : le logo de l'association, centré, 150 pt. */
export function resetAgreementLogo(): void {
  logoCache = DEFAULT_LOGO
  try {
    localStorage.removeItem(LOGO_KEY)
  } catch {
    /* idem */
  }
  notify()
}

// --- l'abonnement React -----------------------------------------------------

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAgreementTemplateOverride(): string | null {
  return useSyncExternalStore(subscribe, readTemplateOverride, readTemplateOverride)
}

export function useAgreementLogo(): AgreementLogo {
  return useSyncExternalStore(subscribe, readAgreementLogo, readAgreementLogo)
}
