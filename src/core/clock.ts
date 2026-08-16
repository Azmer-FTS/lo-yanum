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

// --- Calendar arithmetic (D4) ----------------------------------------------
//
// All of it is local-time and DST-safe: `setDate`/`setHours` on a Date object
// go through the calendar, whereas adding `n * DAY` milliseconds silently
// shifts by an hour across a DST boundary and lands an event on the wrong day.

/** THE WEEK STARTS ON SUNDAY. Israel, and every Hebrew calendar in print. */
export const WEEK_START_DAY = 0

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d)
  out.setDate(1)
  out.setMonth(out.getMonth() + months)
  return out
}

/** Local midnight on the Sunday of `d`'s week. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - ((out.getDay() - WEEK_START_DAY + 7) % 7))
  return out
}

/** Local midnight on the 1st of `d`'s month. */
export function startOfMonth(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(1)
  return out
}

/**
 * The 6×7 block a month grid renders: from the Sunday on or before the 1st,
 * always 42 days. Fixed at six weeks so the grid never changes height between
 * months — a calendar that reflows as you page through it is unreadable.
 */
export function monthGridStart(d: Date): Date {
  return startOfWeek(startOfMonth(d))
}

export const MONTH_GRID_DAYS = 42

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** `YYYY-MM-DD` in LOCAL time — `toISOString()` would shift across midnight. */
export function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parse a `YYYY-MM-DD` day key back into local midnight. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** A local wall-clock time on a given calendar day, as an ISO string. */
export function atTimeOn(day: Date, hours: number, minutes = 0): string {
  const out = new Date(day)
  out.setHours(hours, minutes, 0, 0)
  return iso(out)
}

export function formatMonthYear(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export function formatWeekdayShort(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)
}

/**
 * "לפני 25 דק'" — relative time, as the alert list needs it.
 *
 * `Intl.RelativeTimeFormat` rather than hand-built strings: it is ECMAScript
 * (so /src/core stays pure), and it gets Hebrew's dual and plural forms right,
 * which a `{{count}}` template does not.
 */
export function formatRelative(atIso: string, locale: string, from: Date = now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const deltaMs = new Date(atIso).getTime() - from.getTime()
  const minutes = Math.round(deltaMs / MINUTE)

  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(deltaMs / HOUR)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  return rtf.format(Math.round(deltaMs / DAY), 'day')
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
