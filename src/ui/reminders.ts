import type { LatLng } from '@core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF4.2 (2026-09-09) — LES RAPPELS, ET CE QU'UNE PWA PEUT VRAIMENT FAIRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le brief est explicite sur la façon d'échouer : « Utilise ce qui est
 * disponible dans une PWA ; si une limite technique empêche la notification,
 * DIS-LE dans le rapport au lieu de livrer un réglage qui ne déclenche rien. »
 * Voici donc les deux voies, et laquelle marche quand.
 *
 * ★★ VOIE 1 — LA NOTIFICATION DU NAVIGATEUR, PENDANT QUE L'APP EST OUVERTE.
 *
 *    `scheduleOpenAppReminders` pose un `setTimeout` par rendez-vous à venir
 *    et affiche une `Notification` à l'heure dite. C'est FIABLE tant que
 *    l'onglet vit, et c'est le cas courant du PO : il a l'app ouverte sur son
 *    iPad pendant sa tournée. Ça ne coûte aucune infrastructure et ça ne ment
 *    pas — l'écran de réglage dit à quelle condition ça marche.
 *
 *    ⚠️ ET ÇA S'ARRÊTE AVEC L'ONGLET. iOS suspend puis tue un onglet
 *       d'arrière-plan en quelques minutes ; le `setTimeout` meurt avec lui.
 *
 * ★★ VOIE 2 — LE FICHIER .ics, QUI POSE L'ALARME DANS L'AGENDA DE L'APPAREIL.
 *
 *    C'est la seule voie qui réveille un iPad dont l'app est FERMÉE, et elle
 *    n'a besoin d'aucun serveur. Le fichier porte un `VALARM` avec le délai
 *    choisi ; l'iPad l'ouvre dans son propre agenda, et à partir de là c'est
 *    le système qui sonne. Un geste de plus, et une alarme qui existe.
 *
 * ⛔ CE QUI N'EST PAS FAIT, ET POURQUOI — À LIRE AVANT DE LE DEMANDER.
 *
 *    Une vraie notification poussée (l'app fermée, sans passer par l'agenda)
 *    exige le Web Push : une paire de clés VAPID, un abonnement stocké par
 *    utilisateur, un service worker qui écoute `push`, et UN SERVEUR QUI
 *    ENVOIE À L'HEURE DITE. Les trois premiers sont une journée de travail ;
 *    le quatrième est une tâche planifiée côté Supabase, c'est-à-dire une
 *    fonction de bord et un ordonnanceur que ce programme n'a pas. Sur iOS il
 *    faut EN PLUS que l'app soit installée sur l'écran d'accueil (iOS 16.4+) —
 *    une notification poussée vers un onglet Safari n'existe pas.
 *
 *    Ce n'est pas un obstacle mystérieux, c'est un lot de travail qui n'a pas
 *    été demandé et qui n'aurait pas tenu dans cette passe. Le réglage
 *    livré ici DÉCLENCHE quelque chose dans les deux cas où on le pose ; il
 *    n'y a pas de case qui ne fasse rien.
 */

/** Les délais offerts, en minutes. `-1` = aucune alerte. */
export const REMINDER_CHOICES = [-1, 0, 15, 30, 60, 180, 1440] as const

export interface CalendarEvent {
  uid: string
  title: string
  /** ISO. */
  at: string
  endAt: string
  location: string
  note: string
  position?: LatLng | null
  remindMinutes?: number | null
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `YYYYMMDDTHHMMSSZ`, la seule forme d'horodatage qu'iCalendar accepte partout. */
function icsStamp(iso: string): string {
  const d = new Date(iso)
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/**
 * ⚠️ L'ÉCHAPPEMENT EST OBLIGATOIRE ET IL EST FACILE À OUBLIER. Une virgule ou
 *    un point-virgule non échappé dans un titre coupe la propriété en deux et
 *    l'agenda importe un événement tronqué — et les titres de ce programme en
 *    contiennent (« פגישה: מועצת רמת נגב, 09:00 »).
 */
function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * ⚠️ ET LES LIGNES SE PLIENT À 75 OCTETS. C'est dans la RFC 5545, ce n'est pas
 *    optionnel, et l'hébreu le rend visible tout de suite : chaque lettre pèse
 *    deux octets en UTF-8, donc un titre de quarante caractères dépasse déjà.
 *    Le pli est compté en OCTETS et jamais au milieu d'un caractère.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let size = 0
  const limit = () => (out.length === 0 ? 75 : 74)
  for (const ch of line) {
    const width = new TextEncoder().encode(ch).length
    if (size + width > limit()) {
      out.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += width
  }
  if (current !== '') out.push(current)
  return out.join('\r\n ')
}

/** Le fichier iCalendar d'un rendez-vous, avec son alarme s'il en a une. */
export function calendarFile(event: CalendarEvent): string {
  const location = event.position
    ? `${event.location ? `${event.location} · ` : ''}${event.position.lat.toFixed(5)}, ${event.position.lng.toFixed(5)}`
    : event.location

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//lo-yanum//AF4//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}@lo-yanum`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(event.at)}`,
    `DTEND:${icsStamp(event.endAt)}`,
    `SUMMARY:${icsText(event.title)}`,
  ]
  if (location) lines.push(`LOCATION:${icsText(location)}`)
  if (event.note) lines.push(`DESCRIPTION:${icsText(event.note)}`)
  if (event.position) {
    lines.push(`GEO:${event.position.lat.toFixed(6)};${event.position.lng.toFixed(6)}`)
  }
  if (event.remindMinutes != null && event.remindMinutes >= 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(event.title)}`,
      /* `-PT0M` est refusé par certains agendas ; « à l'heure dite » s'écrit
         `PT0S` avec un signe positif. */
      event.remindMinutes === 0
        ? 'TRIGGER:PT0S'
        : `TRIGGER:-PT${event.remindMinutes}M`,
      'END:VALARM',
    )
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}

/** Le même fichier, remis à l'appareil. Sur un iPad, l'agenda s'ouvre dessus. */
export function downloadCalendarEvent(event: CalendarEvent): void {
  const blob = new Blob([calendarFile(event)], {
    type: 'text/calendar;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${event.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) || 'event'}.ics`
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ---------------------------------------------------------------------------
// Voie 1 — la notification, pendant que l'app est ouverte
// ---------------------------------------------------------------------------

export type NotificationSupport = 'granted' | 'denied' | 'prompt' | 'unsupported'

export function notificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  const p = Notification.permission
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt'
}

/** Demande l'autorisation une fois. Rend l'état obtenu. */
export async function askNotificationPermission(): Promise<NotificationSupport> {
  if (notificationSupport() === 'unsupported') return 'unsupported'
  if (Notification.permission !== 'default') return notificationSupport()
  try {
    await Notification.requestPermission()
  } catch {
    // Safari ancien : l'API à rappel plutôt qu'à promesse. Rien à faire.
  }
  return notificationSupport()
}

export interface DueReminder {
  id: string
  title: string
  body: string
  /** Instant où la notification doit apparaître, en millisecondes. */
  fireAt: number
}

/**
 * Pose les minuteries pour les rappels à venir et rend leur annulation.
 *
 * ⚠️ `setTimeout` PLAFONNE À 2³¹−1 MILLISECONDES (≈ 24,8 jours) et repasse à
 *    ZÉRO au-delà — c'est-à-dire qu'un rappel posé pour dans deux mois
 *    sonnerait IMMÉDIATEMENT. Tout ce qui dépasse la fenêtre est simplement
 *    ignoré : l'app sera rouverte cent fois d'ici là, et c'est la réouverture
 *    qui reposera la minuterie.
 */
const MAX_TIMEOUT_MS = 2_147_483_647

export function scheduleOpenAppReminders(due: readonly DueReminder[]): () => void {
  if (notificationSupport() !== 'granted') return () => undefined
  const now = Date.now()
  const timers: number[] = []
  for (const r of due) {
    const delay = r.fireAt - now
    if (delay <= 0 || delay > MAX_TIMEOUT_MS) continue
    timers.push(
      window.setTimeout(() => {
        try {
          new Notification(r.title, { body: r.body, tag: r.id })
        } catch {
          // Une notification refusée entre-temps n'est pas une erreur à traiter.
        }
      }, delay),
    )
  }
  return () => {
    for (const t of timers) window.clearTimeout(t)
  }
}
