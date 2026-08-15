import { formatDate, formatTime } from './clock'
import { formatCoords, wazeUrl } from './geo'
import type { AnchorPoint, Driver, Farm, FarmContact, Mission } from './types'

/**
 * Generation of the two briefing messages a coordinator sends before a guard.
 *
 * Two formats, because two kinds of phone:
 *   - smartphone → a short message with a Waze deep link
 *   - kosher     → plain text only: written access description, decimal
 *                  coordinates, and every phone number spelled out. No links,
 *                  no map, nothing that needs a browser.
 *
 * All wording is injected via `labels` (supplied by i18next in the UI layer) so
 * this module holds structure only, never copy — the same reason /src/ui holds
 * no Hebrew literals.
 */

export interface AnchorMessageLabels {
  title: string
  farm: string
  anchorPoint: string
  arrival: string
  navigation: string
  access: string
  coordinates: string
  instructions: string
  phones: string
  farmer: string
  driver: string
  coordinator: string
}

export interface AnchorMessageInput {
  farm: Farm
  anchorPoint: AnchorPoint
  mission: Mission | null
  driver: Driver | null
  farmerContact: FarmContact | null
  coordinatorName: string
  coordinatorPhone: string
  locale: string
}

const line = (label: string, value: string): string => `${label}: ${value}`

function scheduleLine(
  input: AnchorMessageInput,
  labels: AnchorMessageLabels,
): string | null {
  if (!input.mission) return null
  const { startAt } = input.mission
  return line(
    labels.arrival,
    `${formatDate(startAt, input.locale)} ${formatTime(startAt, input.locale)}`,
  )
}

function phoneLines(
  input: AnchorMessageInput,
  labels: AnchorMessageLabels,
): string[] {
  const lines: string[] = []
  if (input.farmerContact) {
    lines.push(
      line(labels.farmer, `${input.farmerContact.name} ${input.farmerContact.phone}`),
    )
  }
  if (input.driver) {
    lines.push(line(labels.driver, `${input.driver.name} ${input.driver.phone}`))
  }
  lines.push(
    line(labels.coordinator, `${input.coordinatorName} ${input.coordinatorPhone}`),
  )
  return lines
}

/** Short, link-first message for a volunteer carrying a smartphone. */
export function buildSmartphoneMessage(
  input: AnchorMessageInput,
  labels: AnchorMessageLabels,
): string {
  const { farm, anchorPoint } = input

  const parts: string[] = [
    labels.title,
    '',
    line(labels.farm, `${farm.name}, ${farm.locality}`),
    line(labels.anchorPoint, anchorPoint.name),
  ]

  const schedule = scheduleLine(input, labels)
  if (schedule) parts.push(schedule)

  parts.push(
    '',
    line(labels.navigation, wazeUrl(anchorPoint.position)),
    '',
    `${labels.instructions}:`,
    ...anchorPoint.instructions.map((i) => `• ${i}`),
    '',
    `${labels.phones}:`,
    ...phoneLines(input, labels),
  )

  return parts.join('\n')
}

/**
 * Plain-text SMS for a kosher phone: no links, no formatting that depends on a
 * browser, and the access route written out so it can be followed from memory.
 */
export function buildKosherMessage(
  input: AnchorMessageInput,
  labels: AnchorMessageLabels,
): string {
  const { farm, anchorPoint } = input

  const parts: string[] = [
    labels.title,
    line(labels.farm, `${farm.name}, ${farm.locality}`),
    line(labels.anchorPoint, anchorPoint.name),
  ]

  const schedule = scheduleLine(input, labels)
  if (schedule) parts.push(schedule)

  parts.push(
    '',
    `${labels.access}:`,
    anchorPoint.accessDescription,
    '',
    line(labels.coordinates, formatCoords(anchorPoint.position)),
    '',
    `${labels.instructions}:`,
    ...anchorPoint.instructions.map((i, n) => `${n + 1}. ${i}`),
    '',
    `${labels.phones}:`,
    ...phoneLines(input, labels),
  )

  return parts.join('\n')
}

// --- Outgoing links --------------------------------------------------------

const digits = (phone: string): string => phone.replace(/\D/g, '')

/** Israeli local number (05X…) to E.164 for WhatsApp deep links. */
export function toInternational(phone: string, countryCode = '972'): string {
  const d = digits(phone)
  return d.startsWith('0') ? `${countryCode}${d.slice(1)}` : d
}

export function telHref(phone: string): string {
  return `tel:${digits(phone)}`
}

export function smsHref(phone: string, body?: string): string {
  const base = `sms:${digits(phone)}`
  return body ? `${base}?&body=${encodeURIComponent(body)}` : base
}

export function whatsappHref(phone: string, body?: string): string {
  const base = `https://wa.me/${toInternational(phone)}`
  return body ? `${base}?text=${encodeURIComponent(body)}` : base
}
