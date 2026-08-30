import { chromium } from 'playwright'

/**
 * A68 + A69 — THE SENDING CENTRE, AND THE GROUP KIT.
 *
 * P0bis.5's whole value is that the right person gets the right channel with a
 * message that is already correct. Every part of that is checkable, and none of
 * it is checkable by looking at a screenshot.
 *
 * A68 — THE CHANNELS
 *   1  a SMARTPHONE holder is offered WhatsApp, never SMS;
 *   2  a KOSHER-phone holder is offered SMS, never WhatsApp — a WhatsApp link
 *      to a phone with no data is not a slow message, it is no message;
 *   3  email appears exactly for the people who HAVE an address, and the ones
 *      who do not are not offered a dead button;
 *   4  every link is a valid, PREFILLED deep link: wa.me/972...?text=,
 *      sms:...?&body=, mailto:...?subject=&body=;
 *   5  the grouped SMS carries EVERY kosher phone in one `sms:` recipient
 *      list, and the grouped email every address;
 *   6  the body is the right one — it names the farm and the date, and the
 *      KOSHER version carries no link at all;
 *   7  the sent tick is the only record a hand-off leaves, so it must survive
 *      leaving the screen.
 *
 * A69 — THE GROUP KIT
 *   8  three fields: a formatted name, the numbers, the opening message;
 *   9  the numbers are INTERNATIONAL (+972...) — WhatsApp's own search field
 *      matches nothing else — and include the coordinator;
 *  10  kosher phones are EXCLUDED from the numbers and named as excluded: a
 *      number that silently never joins is worse than a missing one.
 *
 * Run against a live dev server:
 *   BASE_URL=http://localhost:5173 bun run outreach
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const MISSION = process.env.MISSION ?? 'mission-01'

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

interface Row {
  name: string
  channels: string[]
  hrefs: Record<string, string>
}

/** Read the sending centre's rows straight off the rendered DOM. */
const readRows = (): Row[] => {
  const list = document.querySelector('[data-outreach-list]')
  if (!list) return []
  return [...list.querySelectorAll(':scope > li')].map((li) => {
    const name =
      li.querySelector('[data-outreach-name]')?.textContent?.trim() ?? ''
    const links = [...li.querySelectorAll('a[data-channel]')]
    return {
      name,
      channels: links.map((a) => a.getAttribute('data-channel') ?? ''),
      hrefs: Object.fromEntries(
        links.map((a) => [
          a.getAttribute('data-channel') ?? '',
          a.getAttribute('href') ?? '',
        ]),
      ),
    }
  })
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1376, height: 1032 },
  locale: 'he-IL',
})
const page = await context.newPage()
page.setDefaultTimeout(60_000)

console.log('')
console.log('A68/A69 - the sending centre and the WhatsApp group kit')

await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
await page.waitForSelector('select', { state: 'attached' })
await page.selectOption('select', 'coordinator')
await page.evaluate((id) => {
  window.location.hash = `#/coordinator/missions/${id}`
}, MISSION)
await page.waitForTimeout(2500)

await page.evaluate(() => {
  document.querySelector('[data-outreach-list]')?.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(400)

section('A68 - one channel per person, and it is the right one')

const rows = (await page.evaluate(readRows)) as Row[]
check('the sending centre lists the mission people', rows.length >= 3, `${rows.length} rows`)

/**
 * The fixture's own shape, ASSERTED rather than assumed: this guard has to
 * contain at least one of each kind, or the checks below prove nothing.
 */
const withWhatsapp = rows.filter((r) => r.channels.includes('whatsapp'))
const withSms = rows.filter((r) => r.channels.includes('sms'))
const withEmail = rows.filter((r) => r.channels.includes('email'))
const withoutEmail = rows.filter((r) => !r.channels.includes('email'))

check('at least one recipient is on WhatsApp', withWhatsapp.length > 0)
check('at least one recipient is on SMS (a kosher phone)', withSms.length > 0)
check('at least one recipient has an email address', withEmail.length > 0)
check('at least one recipient has NO email address', withoutEmail.length > 0)

check(
  'nobody is offered both WhatsApp and SMS',
  rows.every((r) => !(r.channels.includes('whatsapp') && r.channels.includes('sms'))),
  rows.map((r) => `${r.name}:${r.channels.join('+')}`).join(' | '),
)

check(
  'every WhatsApp link is a prefilled wa.me deep link',
  withWhatsapp.length > 0 &&
    withWhatsapp.every((r) =>
      /^https:\/\/wa\.me\/972\d{8,9}\?text=%/.test(r.hrefs.whatsapp ?? ''),
    ),
  (withWhatsapp[0]?.hrefs.whatsapp ?? '').slice(0, 60),
)
check(
  'every SMS link is a prefilled sms: link',
  withSms.length > 0 &&
    withSms.every((r) => /^sms:\d{9,10}\?&body=%/.test(r.hrefs.sms ?? '')),
  (withSms[0]?.hrefs.sms ?? '').slice(0, 60),
)
check(
  'every email link carries a subject AND a body',
  withEmail.length > 0 &&
    withEmail.every((r) =>
      /^mailto:[^?]+@[^?]+\?subject=%[^&]+&body=%/.test(r.hrefs.email ?? ''),
    ),
  (withEmail[0]?.hrefs.email ?? '').slice(0, 70),
)

const decode = (href: string, key: string): string => {
  const m = new RegExp(`[?&]${key}=([^&]*)`).exec(href)
  return m ? decodeURIComponent(m[1]) : ''
}
const waBody = decode(withWhatsapp[0]?.hrefs.whatsapp ?? '', 'text')
const smsBody = decode(withSms[0]?.hrefs.sms ?? '', 'body')

check('the WhatsApp body names the farm', waBody.includes('חוות'))
check('the WhatsApp body carries the navigation link', waBody.includes('waze.com/ul'))
check(
  'the KOSHER body carries no link - a phone with no browser cannot use one',
  smsBody.length > 0 && !smsBody.includes('http'),
)
check(
  'both bodies address the person by name',
  waBody.includes(withWhatsapp[0]?.name ?? ' ') &&
    smsBody.includes(withSms[0]?.name ?? ' '),
)

const bulk = (await page.evaluate(() => {
  const sms = document.querySelector('a[data-bulk="sms"]')?.getAttribute('href') ?? ''
  const mail = document.querySelector('a[data-bulk="email"]')?.getAttribute('href') ?? ''
  return { sms, mail }
})) as { sms: string; mail: string }

check(
  'the grouped SMS addresses every kosher phone at once',
  bulk.sms.startsWith('sms:') &&
    bulk.sms.slice(4, bulk.sms.indexOf('?')).split(',').length === withSms.length,
  `${bulk.sms.slice(4, bulk.sms.indexOf('?'))} vs ${withSms.length} kosher`,
)
check(
  'the grouped email addresses every address at once',
  bulk.mail.startsWith('mailto:') &&
    bulk.mail.slice(7, bulk.mail.indexOf('?')).split(',').length === withEmail.length,
  `${withEmail.length} addresses`,
)

section('A68 - the tick is the only record a hand-off leaves')

await page.evaluate(() => {
  const btn = document.querySelector('[data-outreach-list] button[data-mark-sent]')
  ;(btn as HTMLElement | null)?.click()
})
await page.waitForTimeout(600)
const ticked = await page.evaluate(
  () => document.querySelectorAll('[data-outreach-list] button[data-sent-at]').length,
)
check('ticking one recipient records it', ticked === 1, `${ticked} ticked`)

await page.evaluate(() => {
  window.location.hash = '#/coordinator/missions'
})
await page.waitForTimeout(900)
await page.evaluate((id) => {
  window.location.hash = `#/coordinator/missions/${id}`
}, MISSION)
await page.waitForTimeout(2200)
const stillTicked = await page.evaluate(
  () => document.querySelectorAll('[data-outreach-list] button[data-sent-at]').length,
)
check('and it survives leaving the screen', stillTicked === 1, `${stillTicked} ticked`)

section('A69 - the group kit: three copies, three pastes')

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(
    (b) => b.getAttribute('data-prepare-group') !== null,
  )
  ;(btn as HTMLElement | undefined)?.click()
})
await page.waitForTimeout(800)

const kit = (await page.evaluate(() => {
  const values = [...document.querySelectorAll('[data-kit-field] textarea')].map(
    (t) => (t as HTMLTextAreaElement).value,
  )
  return { values, body: document.body.innerText }
})) as { values: string[]; body: string }

check('the kit offers exactly three copyable fields', kit.values.length === 3, `${kit.values.length}`)
const [groupName = '', numbers = '', message = ''] = kit.values

check(
  'the group name is formatted "guard <entity> <date>"',
  new RegExp('^שמירה .+ \\d{2}\\.\\d{2}\\.\\d{4}$').test(
    groupName.trim(),
  ),
  groupName,
)
const numberList = numbers.split('\n').filter(Boolean)
check(
  'every number is international',
  numberList.length > 0 && numberList.every((n) => /^\+972\d{8,9}$/.test(n)),
  numberList.join(' '),
)
check(
  'the coordinator is in the list, and only smartphones besides him',
  numberList.length === withWhatsapp.length + 1,
  `${numberList.length} numbers for ${withWhatsapp.length} smartphone recipients + 1`,
)
check(
  'the kit says which kosher phones were left out',
  kit.body.includes('טלפון כשר') &&
    withSms.every((r) => kit.body.includes(r.name)),
  withSms.map((r) => r.name).join(' · '),
)
check(
  'the opening message names the farm, the date and carries the link',
  message.includes('חוות') &&
    /\d{2}\.\d{2}\.\d{4}/.test(message) &&
    message.includes('waze.com/ul'),
  message.split('\n').slice(0, 2).join(' / '),
)
check(
  'and it is addressed to the group, not to somebody by name',
  !message.includes('שלום '),
  message.split('\n').slice(0, 3).join(' / '),
)
check(
  'the three-step guide is on screen',
  kit.body.includes('קבוצה חדשה'),
)

await context.close()
await browser.close()

console.log('')
if (failed === 0) {
  console.log(`  All ${passed} checks passed.`)
} else {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
