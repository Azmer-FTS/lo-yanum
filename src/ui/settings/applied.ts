/**
 * ★★ AS4 — « UN RÉGLAGE VIENT D'ARRIVER D'UN AUTRE APPAREIL ».
 *
 * Les modules de réglage gardent leur valeur en cache (AH11.2 l'avait réglé
 * en appliquant AVANT le premier rendu — ce qui ne vaut que pour le démarrage
 * à froid). Une synchronisation au retour en avant-plan arrive APRÈS : chaque
 * module s'abonne ici, vide son cache et prévient ses écrans. Aucun
 * rechargement de page — un formulaire en cours de saisie ne se perd pas.
 */
const APPLIED = 'lo-yanum:settings-applied'
const CONFLICT = 'lo-yanum:settings-conflict'

export function announceSettingsApplied(keys: string[]): void {
  try {
    window.dispatchEvent(new CustomEvent(APPLIED, { detail: keys }))
  } catch {
    /* hors navigateur */
  }
}

export function announceSettingsConflict(keys: string[]): void {
  try {
    window.dispatchEvent(new CustomEvent(CONFLICT, { detail: keys }))
  } catch {
    /* hors navigateur */
  }
}

/** `cb` reçoit les clés appliquées ; ne se déclenche que pour `keys` si donné. */
export function onSettingsApplied(keys: readonly string[] | null, cb: (applied: string[]) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event): void => {
    const applied = ((e as CustomEvent<string[]>).detail ?? []) as string[]
    if (keys === null || applied.some((k) => keys.includes(k))) cb(applied)
  }
  window.addEventListener(APPLIED, handler)
  return () => window.removeEventListener(APPLIED, handler)
}

export function onSettingsConflict(cb: (keys: string[]) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event): void => cb(((e as CustomEvent<string[]>).detail ?? []) as string[])
  window.addEventListener(CONFLICT, handler)
  return () => window.removeEventListener(CONFLICT, handler)
}
