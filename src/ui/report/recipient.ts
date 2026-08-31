/**
 * PO POINT 7b — WHERE THE REPORT GOES, AND WHY IT IS A LOCAL SETTING.
 *
 * The product owner asked for a configurable "כתובת דוחות" in הגדרות. It lives
 * in `localStorage` and not in the database, and that is a decision rather than
 * a shortcut:
 *
 * ★ IT IS NEEDED WITH NO NETWORK. The whole point of the report is that a
 *   coordinator standing in a field can send it; a value that has to be
 *   fetched is a value that is missing exactly when he needs it.
 * ★ AND IT IS NOT PROGRAMME DATA. It is one person's preference about his own
 *   device, in the same class as the theme (`theme.tsx`) and the map/content
 *   seam ratio (`mapMode.tsx`), both of which live here for the same reason.
 *
 * ⚠️ P3.3bis — THE AUTOMATIC SEND WILL NEED IT SERVER-SIDE. An edge function
 *   cannot read a browser's localStorage, so when the monthly email is built
 *   this becomes a row (a `settings` table, or a column on `app_users`) and
 *   this module becomes its cache. Noted here rather than discovered then.
 */
const KEY = 'lo-yanum:report-recipient'

export function readReportRecipient(): string {
  try {
    return localStorage.getItem(KEY)?.trim() ?? ''
  } catch {
    // Private browsing, or storage disabled: no recipient, and the button
    // says so rather than failing.
    return ''
  }
}

export function writeReportRecipient(email: string): void {
  try {
    const v = email.trim()
    if (v === '') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, v)
  } catch {
    // Nothing to do: the value is a convenience, never a requirement.
  }
}
