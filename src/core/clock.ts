/**
 * All time arithmetic lives here so the mock data can be generated relative to
 * "now" — "tonight's guard" must genuinely be tonight whenever the POC is
 * opened, otherwise the farmer and volunteer screens demo as empty states.
 *
 * Pure: `Date` and `Intl` are ECMAScript, not DOM.
 */

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export function now(): Date {
  return new Date()
}

export function iso(d: Date): string {
  return d.toISOString()
}

/** Local midnight at the start of the day `offsetDays` from today. */
export function startOfDay(offsetDays = 0, from: Date = now()): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d
}

/** A local wall-clock time on a given day offset, as an ISO string. */
export function atTime(offsetDays: number, hours: number, minutes = 0): string {
  const d = startOfDay(offsetDays)
  d.setHours(hours, minutes, 0, 0)
  return iso(d)
}

/**
 * A guard night starting on `offsetDays` at `startHour` and ending the next
 * morning at `endHour`. Returns both ends as ISO strings.
 */
export function guardNight(
  offsetDays: number,
  startHour = 21,
  endHour = 5,
): { startAt: string; endAt: string } {
  return {
    startAt: atTime(offsetDays, startHour),
    endAt: atTime(offsetDays + 1, endHour),
  }
}

/** An ISO timestamp `h` hours from now (negative for the past). */
export function hoursFromNow(h: number): string {
  return iso(new Date(now().getTime() + h * HOUR))
}

/** How far ahead a guard still counts as "tonight's" guard. */
export const TONIGHT_LOOKAHEAD_HOURS = 14

/**
 * "Tonight" spans two calendar days, so it cannot be a calendar-day test.
 * A guard is tonight's guard if it has not finished yet and starts within the
 * look-ahead window — true whether the app is opened at 09:00 or at 02:00.
 */
export function isTonight(
  startAt: string,
  endAt: string,
  from: Date = now(),
): boolean {
  const t = from.getTime()
  return (
    new Date(endAt).getTime() > t &&
    new Date(startAt).getTime() < t + TONIGHT_LOOKAHEAD_HOURS * HOUR
  )
}

export function isFuture(atIso: string, from: Date = now()): boolean {
  return new Date(atIso).getTime() > from.getTime()
}

export function minutesAgo(atIso: string, from: Date = now()): number {
  return Math.round((from.getTime() - new Date(atIso).getTime()) / MINUTE)
}

// --- Formatting (locale supplied by the caller; never hard-coded) ----------

export function formatDate(atIso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(atIso))
}

export function formatTime(atIso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(atIso))
}

export function formatDateTime(atIso: string, locale: string): string {
  return `${formatDate(atIso, locale)} · ${formatTime(atIso, locale)}`
}

export function formatWeekday(atIso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
    new Date(atIso),
  )
}

/** Day-of-month key used to group mission lists. */
export function dayKey(atIso: string): string {
  return atIso.slice(0, 10)
}
