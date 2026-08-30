import { COORDINATOR } from './config'
import { formatDate, formatTime } from './clock'
import { toInternational } from './messages'
import type { MissionView, PhoneType } from './types'
import { wazeUrl } from './geo'

/**
 * P0bis.5 — THE SENDING CENTRE, AND THE LAW IT IS SHAPED BY.
 *
 * The product owner asked for a screen that tells everyone about a guard. The
 * honest version of that feature is smaller than it sounds, and the limit is
 * legal rather than technical:
 *
 *   · **No third-party application may send a WhatsApp on a user's behalf, or
 *     create a WhatsApp group for him.** The WhatsApp Business API can, at a
 *     price and behind Meta's approval — noted in ETAT as a future step IF the
 *     association funds it. Everything short of that is a HAND-OFF: a deep
 *     link that opens the user's own WhatsApp with the message already typed,
 *     which he then sends himself.
 *   · **An SMS is the same:** `sms:` opens the phone's own composer.
 *   · **Email is the exception.** It is the one channel a server can send on
 *     its own, and P3.3bis will do exactly that. Until then a `mailto:` is the
 *     same one-tap hand-off as the other two.
 *
 * So this module produces, per person: the RIGHT channel, and a message
 * already written. What it cannot produce is a delivery — which is why the
 * screen keeps a "sent" checklist rather than a status. The coordinator's tick
 * is the only truthful record we have, and it is the record that stops a
 * volunteer standing at a farm gate at 21:30 for a night that is not
 * happening.
 *
 * WHY THE CHANNEL IS A FUNCTION OF THE PHONE
 * ------------------------------------------
 * Half this programme's volunteers carry "kosher phones" — calls and SMS, no
 * data, no apps. A WhatsApp link sent to one of them is not a slow message, it
 * is no message. So: smartphone → WhatsApp, kosher → SMS, and email ALONGSIDE
 * either when there is an address (it is the channel that will become
 * automatic, so it is never the fallback of last resort).
 */
export type OutreachEvent = 'created' | 'updated' | 'cancelled'
export type OutreachChannel = 'whatsapp' | 'sms' | 'email'
export type RecipientKind = 'volunteer' | 'driver' | 'farmer'

export const OUTREACH_EVENTS: readonly OutreachEvent[] = [
  'created',
  'updated',
  'cancelled',
] as const

export interface OutreachRecipient {
  kind: RecipientKind
  /** Volunteer id / driver id / farm-contact id. */
  id: string
  name: string
  phone: string
  /** '' when the person has no address — see `Volunteer.email`. */
  email: string
  phoneType: PhoneType
  /** Whether this volunteer holds the group's phone. */
  isGroupPhone: boolean
  /** The primary channel first; `email` follows it when there is an address. */
  channels: OutreachChannel[]
}

/**
 * The channel ladder for one person. A kosher phone CANNOT take a WhatsApp, so
 * this is a fact about the device and not a preference.
 */
export function channelsFor(
  phoneType: PhoneType,
  email: string,
): OutreachChannel[] {
  const primary: OutreachChannel = phoneType === 'kosher' ? 'sms' : 'whatsapp'
  return email ? [primary, 'email'] : [primary]
}

/**
 * Everyone a guard's news has to reach, derived from the mission ITSELF rather
 * than from a stored list.
 *
 * G9bis stored the cancellation's recipients as a snapshot at cancel time. A
 * driver added afterwards was then invisible on the very screen whose job is
 * "who still has to be told". Deriving the list means the screen is right for
 * whatever the mission is NOW; only the sent ticks are stored.
 *
 * A DRIVER IS ASSUMED TO HAVE A SMARTPHONE. He is navigating by Waze on the
 * night — the same assumption the driver message already makes.
 */
export function outreachRecipients(view: MissionView): OutreachRecipient[] {
  const farmerContact =
    view.farm.contacts.find((c) => c.isPrimary) ?? view.farm.contacts[0] ?? null

  return [
    ...view.volunteers.map(({ volunteer, isGroupPhone }) => ({
      kind: 'volunteer' as const,
      id: volunteer.id,
      name: volunteer.name,
      phone: volunteer.phone,
      email: volunteer.email,
      phoneType: volunteer.phoneType,
      isGroupPhone,
      channels: channelsFor(volunteer.phoneType, volunteer.email),
    })),
    ...view.drivers.map(({ driver }) => ({
      kind: 'driver' as const,
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      phoneType: 'smartphone' as PhoneType,
      isGroupPhone: false,
      channels: channelsFor('smartphone', driver.email),
    })),
    ...(farmerContact
      ? [
          {
            kind: 'farmer' as const,
            id: farmerContact.id,
            name: farmerContact.name,
            phone: farmerContact.phone,
            email: farmerContact.email,
            phoneType: 'smartphone' as PhoneType,
            isGroupPhone: false,
            channels: channelsFor('smartphone', farmerContact.email),
          },
        ]
      : []),
  ]
}

/**
 * The kosher-phone recipients, for the ONE grouped SMS.
 *
 * `sms:` accepts several numbers separated by a comma, and every phone this
 * programme's volunteers carry composes one message to all of them. Sending
 * eight identical SMS one at a time is eight chances to skip somebody at
 * 16:40, which is the failure this button exists to prevent.
 */
export function smsGroupRecipients(
  recipients: readonly OutreachRecipient[],
): OutreachRecipient[] {
  return recipients.filter((r) => r.phoneType === 'kosher')
}

/** Everyone with an address — the one list P3.3bis will send automatically. */
export function emailRecipients(
  recipients: readonly OutreachRecipient[],
): OutreachRecipient[] {
  return recipients.filter((r) => r.email !== '')
}

// ---------------------------------------------------------------------------
// The messages
// ---------------------------------------------------------------------------

export interface OutreachLabels {
  /** One per event: "משמרת חדשה" / "עדכון משמרת" / "ביטול משמרת". */
  title: Record<OutreachEvent, string>
  greeting: string
  farm: string
  date: string
  time: string
  anchorPoint: string
  navigation: string
  driver: string
  coordinator: string
  reason: string
  askCreated: string
  askUpdated: string
  askCancelled: string
  signature: string
  /** For the WhatsApp group kit. */
  groupName: string
}

export interface OutreachInput {
  event: OutreachEvent
  view: MissionView
  recipient: OutreachRecipient
  /** Free-text note: the cancellation reason's note, or what changed. */
  note: string
  /** Resolved label for the cancellation reason, when there is one. */
  reasonLabel: string
  locale: string
}

const line = (label: string, value: string): string => `${label}: ${value}`

/**
 * One message, for one person, about one event.
 *
 * Kosher phones get NO LINK — a phone with no browser turns a Waze URL into 60
 * characters of noise in a 160-character SMS. That rule predates this module
 * (`buildKosherMessage`) and is the reason the two message builders exist; it
 * applies here for the same reason.
 */
export function buildOutreachMessage(
  input: OutreachInput,
  labels: OutreachLabels,
): string {
  const { event, view, recipient, note, reasonLabel, locale } = input
  const { mission, farm, anchorPoint } = view
  const withLinks = recipient.phoneType !== 'kosher'

  const parts: string[] = [labels.title[event], '']
  // A group's opening message is addressed to nobody in particular; a person's
  // is addressed to him by name. An empty recipient name is the group case.
  if (recipient.name) parts.push(`${labels.greeting} ${recipient.name},`, '')
  parts.push(
    line(labels.farm, farm.name),
    line(labels.date, formatDate(mission.startAt, locale)),
    line(
      labels.time,
      `${formatTime(mission.startAt, locale)}–${formatTime(mission.endAt, locale)}`,
    ),
  )

  if (event !== 'cancelled') {
    parts.push(line(labels.anchorPoint, anchorPoint.name))
    if (withLinks) {
      parts.push(line(labels.navigation, wazeUrl(anchorPoint.position)))
    }
    const firstDriver = view.drivers[0]?.driver ?? view.driver
    if (firstDriver && recipient.kind !== 'driver') {
      parts.push(line(labels.driver, `${firstDriver.name} · ${firstDriver.phone}`))
    }
  } else {
    if (reasonLabel) parts.push(line(labels.reason, reasonLabel))
  }

  if (note.trim()) parts.push('', note.trim())

  parts.push(
    '',
    event === 'created'
      ? labels.askCreated
      : event === 'updated'
        ? labels.askUpdated
        : labels.askCancelled,
    '',
    `${labels.signature} ${COORDINATOR.name} · ${COORDINATOR.phone}`,
  )

  return parts.join('\n')
}

/** The subject line for the email channel. Short, and it names the farm. */
export function outreachSubject(
  input: Pick<OutreachInput, 'event' | 'view' | 'locale'>,
  labels: OutreachLabels,
): string {
  const { view, locale } = input
  return `${labels.title[input.event]} · ${view.farm.name} · ${formatDate(
    view.mission.startAt,
    locale,
  )}`
}

// ---------------------------------------------------------------------------
// P0bis.5c — the WhatsApp group kit
// ---------------------------------------------------------------------------

/**
 * Everything needed to create the night's WhatsApp group BY HAND, in three
 * copies.
 *
 * The group cannot be created for the coordinator — see the note at the top of
 * this file — so the next best thing is to remove every step that involves
 * typing: the group's name, the members' numbers in the format WhatsApp's own
 * "add participants" field accepts, and the opening message.
 *
 * The numbers are INTERNATIONAL (+972…): WhatsApp matches a contact by its
 * international number, and a local `05x` pasted into the search box finds
 * nobody. Kosher phones are deliberately EXCLUDED — they cannot join a
 * WhatsApp group at all, and a number in that list that silently never joins
 * is exactly the kind of half-complete roster this programme cannot afford.
 * They are told by the grouped SMS instead.
 */
export interface GroupKit {
  name: string
  /** International numbers, one per line, ready to paste. */
  numbers: string[]
  /** The people behind those numbers, for the on-screen list. */
  members: OutreachRecipient[]
  /** Who was left out because a kosher phone cannot join. */
  excluded: OutreachRecipient[]
  message: string
}

export function buildGroupKit(
  view: MissionView,
  labels: OutreachLabels,
  locale: string,
): GroupKit {
  const recipients = outreachRecipients(view)
  const members = recipients.filter((r) => r.phoneType !== 'kosher')
  const excluded = recipients.filter((r) => r.phoneType === 'kosher')

  const numbers = [
    ...members.map((r) => `+${toInternational(r.phone)}`),
    // The coordinator adds himself: a group he is not in is a group he cannot
    // read at 02:00.
    `+${toInternational(COORDINATOR.phone)}`,
  ]

  const name = `${labels.groupName} ${view.farm.name} ${formatDate(
    view.mission.startAt,
    locale,
  )}`

  const message = buildOutreachMessage(
    {
      event: 'created',
      view,
      // The opening message is addressed to the GROUP, not to a person, and
      // it always carries the links: everyone in it holds a smartphone.
      recipient: {
        kind: 'volunteer',
        id: 'group',
        // Empty ON PURPOSE: `buildOutreachMessage` reads that as "addressed to
        // the group" and drops the "שלום <name>," line, which would otherwise
        // greet a farm by its own name.
        name: '',
        phone: '',
        email: '',
        phoneType: 'smartphone',
        isGroupPhone: true,
        channels: ['whatsapp'],
      },
      note: '',
      reasonLabel: '',
      locale,
    },
    labels,
  )

  return { name, numbers, members, excluded, message }
}
