import { readFileSync } from 'node:fs'

import {
  APPOINTMENT_DAY_END_HOUR,
  APPOINTMENT_DAY_START_HOUR,
  APPOINTMENT_HORIZON_DAYS,
  APPOINTMENT_LEAD_HOURS,
  APPOINTMENT_SLOT_MINUTES,
  BUSY_MIN_MINUTES,
  CLOSED_WEEKDAYS,
  JEWISH_HOLIDAYS,
  closedReason,
  dayKeyAfter,
  freeSlots,
  hebrewDayOf,
  holidayOn,
  isAvailableDay,
  jerusalemDayKey,
  jerusalemInstant,
} from '../src/core/availability'
import {
  MAX_DOCUMENTS,
  MAX_DOCUMENT_BYTES,
  MAX_PICKED_BYTES,
  REQUEST_STEPS,
  SKIPPABLE_STEPS,
  aidRequestProblems,
  base64Bytes,
  canSubmit,
  emptyAidRequest,
  farmTypeOf,
  idNumberValue,
  refuseDocument,
  refusePick,
  stepProgress,
} from '../src/core/request'
import type { AidRequestDraft } from '../src/core/request'
import { expectedDocuments } from '../src/core/documents'
import {
  ALL_FARM_STATUSES,
  FARM_PIPELINE,
  FARM_STATUSES_INTAKE,
  FARM_STATUSES_OFF_PIPELINE,
  countsTowardProgramme,
} from '../src/core/types'
import { KIND_DOM } from '../src/core/fieldKind'
import { shippedAgreementTemplate } from './apshipped'
import shipped from '../src/bakasha/agreementShipped'
import he from '../src/locales/he.json'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AP — LA PAGE PUBLIQUE, SANS NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run appass
 *
 *   A250  les documents demandés suivent le choix de l'étape 2 : un, un, deux.
 *   A251  l'étape des documents peut être passée ; la demande part quand même.
 *   A252  le zéro initial d'un ת״ז est conservé de bout en bout.
 *   A253  le courriel est facultatif, le téléphone est obligatoire.
 *   A256  un fichier trop gros ou d'un type interdit est refusé.
 *   A258  aucun créneau un vendredi, un samedi, ou un jour de fête juive ;
 *         aucun créneau qui chevauche l'agenda du PO.
 *   A260  les DEUX MOITIÉS d'une même règle sont égales — les plafonds écrits
 *         en SQL et en TypeScript, le texte livré de l'accord des deux côtés,
 *         la table des claviers.
 *   A261  le statut « בקשה נכנסת » est passé par toutes les listes qui
 *         énumèrent les statuts à la main (règle 10 de PROJECT_STATE.md).
 *
 * ⚠️ CE QUI N'EST PAS ICI : le parcours sur un téléphone (A249), ce que le
 *    NAVIGATEUR fait des claviers (A254), l'ouverture sans compte (A257), et
 *    l'arrivée en base (A255 · A259). Une règle pure ne peut pas voir un
 *    doigt ni une requête HTTP — voir `bun run apui`.
 */

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

const MIGRATION = readFileSync('supabase/migrations/20260925000200_aid_requests.sql', 'utf8')

/** Une demande complète, celle qui doit passer. */
function fullDraft(): AidRequestDraft {
  return {
    ...emptyAidRequest(),
    need: 'both',
    landKind: 'both',
    farmName: 'חוות הבדיקה',
    fullName: 'ישראל ישראלי',
    idNumber: '021985189',
    phone: '052-5274774',
    email: '',
    locality: 'מיצד',
  }
}

// ---------------------------------------------------------------------------
section('A250 — les documents demandés suivent le choix de l\'étape 2')
// ---------------------------------------------------------------------------
{
  check('A250 · חקלאות seule → UN document, celui des cultures',
    JSON.stringify(expectedDocuments(farmTypeOf('crops'))) === '["crops"]',
    expectedDocuments(farmTypeOf('crops')).join(' · '))
  check('A250 · מרעה seul → UN document, celui du pâturage',
    JSON.stringify(expectedDocuments(farmTypeOf('grazing'))) === '["grazing"]',
    expectedDocuments(farmTypeOf('grazing')).join(' · '))
  check('A250 · שניהם → LES DEUX',
    JSON.stringify(expectedDocuments(farmTypeOf('both'))) === '["crops","grazing"]',
    expectedDocuments(farmTypeOf('both')).join(' · '))
  /* ⚠️ ET C'EST LA FONCTION DE L'APPLICATION, PAS UNE COPIE. Si quelqu'un
     réécrivait la correspondance dans `src/bakasha`, les deux pourraient
     diverger — et l'agriculteur téléverserait le mauvais papier. */
  const page = readFileSync('src/bakasha/Documents.tsx', 'utf8')
  check('A250 · et la page appelle `expectedDocuments`, elle n\'a pas sa propre table',
    page.includes("from '@core/documents'") && page.includes('expectedDocuments('))
  check('A250 · la page ne connaît AUCUN nom de document en dur',
    !/['"]crops['"]\s*:\s*\[/.test(page) && !page.includes("['crops', 'grazing']"))
}

// ---------------------------------------------------------------------------
section('A251 — l\'étape des documents se passe, et la demande part')
// ---------------------------------------------------------------------------
{
  check('A251 · « documents » est déclarée facultative',
    SKIPPABLE_STEPS.includes('documents'))
  check('A251 · « appointment » aussi', SKIPPABLE_STEPS.includes('appointment'))
  const d = fullDraft()
  check('A251 · une demande SANS aucun document peut partir',
    d.documents.length === 0 && canSubmit(d))
  check('A251 · une demande sans rendez-vous peut partir',
    d.appointmentAt === null && canSubmit(d))
  check('A251 · et sans signature non plus rien ne bloque',
    d.signature === null && canSubmit(d))
  /* ⚠️ ET LA BASE NE LES EXIGE PAS DAVANTAGE : une validation de navigateur
     permissive doublée d'un SQL strict rendrait l'étape « facultative » à
     l'écran et obligatoire en vrai. */
  /* ⚠️ LA PREMIÈRE ÉCRITURE DE CETTE LIGNE EMPLOYAIT `/documents.*is null.*raise/s`
     — un motif en mode « point = tout », qui traversait mille lignes et
     trouvait les trois mots n'importe où. Ce qu'on veut savoir est précis :
     les trois choses facultatives ne sont examinées QUE si elles sont là. */
  check('A251 · et le SQL n\'exige ni document, ni signature, ni rendez-vous',
    MIGRATION.includes('if v_signature is not null then') &&
      MIGRATION.includes('if v_appt is not null then') &&
      !/jsonb_array_length\(v_documents\)\s*=\s*0/.test(MIGRATION) &&
      !/v_signature is null[\s\S]{0,60}raise exception/.test(MIGRATION) &&
      !/v_appt is null[\s\S]{0,60}raise exception/.test(MIGRATION))
  check('A251 · les sept étapes, dans l\'ordre du brief',
    JSON.stringify(REQUEST_STEPS) ===
      JSON.stringify(['need', 'land', 'who', 'documents', 'agreement', 'appointment', 'done']),
    REQUEST_STEPS.join(' → '))
  /* La barre ne doit jamais afficher 0 % : une barre vide se lit comme une
     page qui n'a pas chargé. Vu sur capture en AP3. */
  check('A251 · la barre de progression part au-dessus de zéro et finit à cent',
    stepProgress('need') > 0 && stepProgress('appointment') === 100,
    `${stepProgress('need')}% … ${stepProgress('appointment')}%`)
}

// ---------------------------------------------------------------------------
section('A252 — le zéro initial d\'un ת״ז est conservé')
// ---------------------------------------------------------------------------
{
  check('A252 · `idNumberValue` garde le zéro de tête',
    idNumberValue('021985189') === '021985189', idNumberValue('021985189'))
  check('A252 · et ne rogne pas non plus un ח״פ de neuf chiffres',
    idNumberValue('557457074') === '557457074')
  check('A252 · la ponctuation collée est retirée, les chiffres ne bougent pas',
    idNumberValue('02-198 5189') === '021985189')
  check('A252 · dix chiffres sont tronqués à neuf, pas réinterprétés',
    idNumberValue('0219851899') === '021985189')
  /* ⚠️ LE CHAMP EST `type="text"`, ET C'EST CE QUI TIENT LE ZÉRO. AM4 le dit
     en toutes lettres : « jamais `type="number"`, il mange le zéro initial ». */
  check('A252 · le clavier `id` est un TEXTE avec un pavé numérique',
    KIND_DOM.id.type === 'text' && KIND_DOM.id.inputMode === 'numeric',
    `${KIND_DOM.id.type} / ${KIND_DOM.id.inputMode}`)
  /* Et en base : la colonne est du texte, des deux côtés. */
  check('A252 · `aid_requests.id_number` est du TEXTE en base',
    /id_number\s+text/.test(MIGRATION))
  check('A252 · et la page n\'emploie nulle part `type="number"`',
    !readFileSync('src/bakasha/App.tsx', 'utf8').includes('type="number"'))
}

// ---------------------------------------------------------------------------
section('A253 — courriel facultatif, téléphone obligatoire')
// ---------------------------------------------------------------------------
{
  const noPhone = { ...fullDraft(), phone: '' }
  check('A253 · sans נייד, la demande ne part pas',
    !canSubmit(noPhone) &&
      aidRequestProblems(noPhone).some((p) => p.field === 'phone' && p.reason === 'missing'))
  const badPhone = { ...fullDraft(), phone: '12' }
  check('A253 · un נייד impossible est nommé comme tel, pas comme manquant',
    aidRequestProblems(badPhone).some((p) => p.field === 'phone' && p.reason === 'impossible'))
  check('A253 · SANS mail, la demande part',
    canSubmit({ ...fullDraft(), email: '' }))
  check('A253 · avec un mail valable aussi',
    canSubmit({ ...fullDraft(), email: 'dov@example.com' }))
  check('A253 · un mail TAPÉ mais impossible bloque — et lui seul',
    !canSubmit({ ...fullDraft(), email: 'michel@' }) &&
      aidRequestProblems({ ...fullDraft(), email: 'michel@' }).length === 1)
  check('A253 · un numéro international recopié de WhatsApp passe',
    canSubmit({ ...fullDraft(), phone: '+972 52 527 4774' }))
  check('A253 · un fixe passe aussi (08-6564111)',
    canSubmit({ ...fullDraft(), phone: '08-6564111' }))
  /* ⚠️ ET LA LISTE DE CE QUI BLOQUE EST COURTE, PARCE QU'UN CHAMP OBLIGATOIRE
     DE TROP EST UN ÉCRAN DE TROP (AM1). */
  const bare = { ...emptyAidRequest(), need: 'both' as const, landKind: 'both' as const }
  check('A253 · TROIS champs bloquent, et pas un de plus',
    aidRequestProblems(bare).length === 3,
    aidRequestProblems(bare).map((p) => p.field).join(' · '))
  check('A253 · ni ת״ז, ni יישוב, ni mail dans cette liste',
    !aidRequestProblems(bare).some((p) => ['idNumber', 'locality', 'email'].includes(p.field)))
  /* Et le SQL dit la même chose, sinon l'un des deux ment. */
  check('A253 · le SQL refuse un numéro impossible',
    MIGRATION.includes("raise exception 'phone'"))
  check('A253 · et n\'examine le courriel QUE s\'il est non vide',
    /if v_email <> '' and v_email !~/.test(MIGRATION))
}

// ---------------------------------------------------------------------------
section('A256 — un fichier trop gros ou d\'un type interdit est refusé')
// ---------------------------------------------------------------------------
{
  check('A256 · un PDF de taille normale est accepté',
    refusePick({ type: 'application/pdf', size: 900_000 }) === null)
  check('A256 · une photo est acceptée (elle sera composée en PDF)',
    refusePick({ type: 'image/jpeg', size: 4_000_000 }) === null)
  check('A256 · un fichier trop gros est refusé, et le refus dit « trop gros »',
    refusePick({ type: 'image/jpeg', size: MAX_PICKED_BYTES + 1 }) === 'too_big')
  check('A256 · un exécutable est refusé pour son TYPE',
    refusePick({ type: 'application/x-msdownload', size: 1000 }) === 'wrong_type')
  check('A256 · un type vide n\'est PAS un type interdit (Android le rend parfois)',
    refusePick({ type: '', size: 1000 }) === null)
  /* ⚠️ ET LE REPROCHE EST « TROP GROS » D'ABORD : c'est celui que le lecteur
     peut corriger. */
  check('A256 · un fichier à la fois trop gros et interdit s\'entend dire « trop gros »',
    refusePick({ type: 'video/mp4', size: MAX_PICKED_BYTES + 1 }) === 'too_big')

  const pdf = 'data:application/pdf;base64,' + 'A'.repeat(1000)
  check('A256 · ce qui PART est mesuré aussi, pas seulement ce qui est choisi',
    refuseDocument(pdf) === null)
  check('A256 · un PNG déguisé en document est refusé au départ',
    refuseDocument('data:image/png;base64,AAAA') === 'wrong_type')
  /* ⚠️ `MAX_DOCUMENT_BYTES + 4` CARACTÈRES DE BASE64 NE FONT PAS
     `MAX_DOCUMENT_BYTES + 4` OCTETS : le base64 pèse les trois quarts de sa
     longueur. La première écriture de cette ligne fabriquait donc un fichier
     de 6,3 Mo et s'étonnait qu'un plafond de 8 le laisse passer. */
  const tooBig = 'data:application/pdf;base64,' + 'A'.repeat(Math.ceil((MAX_DOCUMENT_BYTES + 1) * 4 / 3) + 4)
  check('A256 · un PDF au-delà du plafond est refusé au départ',
    refuseDocument(tooBig) === 'too_big',
    `${base64Bytes(tooBig.slice(28))} octets pour un plafond de ${MAX_DOCUMENT_BYTES}`)
  check('A256 · `base64Bytes` compte le rembourrage',
    base64Bytes('QUJD') === 3 && base64Bytes('QUI=') === 2 && base64Bytes('QQ==') === 1,
    `${base64Bytes('QUJD')} · ${base64Bytes('QUI=')} · ${base64Bytes('QQ==')}`)

  /* ⚠️⚠️ ET C'EST LE SERVEUR QUI PROTÈGE. Une borne de navigateur n'est pas
     une protection : un appel fabriqué avec `curl` ne passe par aucune des
     lignes ci-dessus. */
  check('A256 · le SQL refuse un document qui n\'est pas un PDF',
    MIGRATION.includes("'^data:application/pdf;base64,'") &&
      MIGRATION.includes("raise exception 'documentType'"))
  check('A256 · le SQL mesure la taille sur la chaîne reçue',
    /octet_length\(v_doc ->> 'file'\) > max_document_bytes/.test(MIGRATION))
  check('A256 · le SQL borne le NOMBRE de documents',
    MIGRATION.includes('jsonb_array_length(v_documents) > max_documents'))
  check('A256 · et il borne la signature aussi',
    MIGRATION.includes("'^data:image/png;base64,'") &&
      MIGRATION.includes('max_signature_bytes'))
}

// ---------------------------------------------------------------------------
section('A258 — jamais un vendredi, un samedi, ni un jour de fête')
// ---------------------------------------------------------------------------
{
  check('A258 · les jours fermés sont NOMMÉS : vendredi (5) et samedi (6)',
    JSON.stringify([...CLOSED_WEEKDAYS]) === '[5,6]', CLOSED_WEEKDAYS.join(' · '))

  /* Des dates connues, vérifiables au calendrier. */
  check('A258 · 2026-09-25 est un vendredi → fermé',
    closedReason('2026-09-25') === 'weekend', String(closedReason('2026-09-25')))
  check('A258 · 2026-09-26 est un samedi → fermé',
    closedReason('2026-09-26') === 'weekend', String(closedReason('2026-09-26')))
  check('A258 · 2026-09-27 est un dimanche → ouvert',
    isAvailableDay('2026-09-27'))

  /* ⚠️ LES FÊTES SONT LUES DANS LE CALENDRIER HÉBRAÏQUE, PAS DANS UNE TABLE
     DE DATES GRÉGORIENNES QUI PÉRIMERAIT CHAQUE AUTOMNE. Trois années
     différentes, donc, et à chaque fois la même fête. */
  const kippur = [
    ['2026-09-21', '5787'],
    ['2027-10-11', '5788'],
    ['2028-09-30', '5789'],
  ] as const
  for (const [day] of kippur) {
    const heb = hebrewDayOf(day)
    check(`A258 · ${day} = ${heb.day} ${heb.month} → יום כיפור, fermé`,
      holidayOn(day) === 'יום כיפור', `${holidayOn(day)}`)
  }
  check('A258 · le 15 Nissan (פסח) est fermé',
    holidayOn('2026-04-02') === 'פסח', String(holidayOn('2026-04-02')))
  check('A258 · le 6 Sivan (שבועות) est fermé',
    holidayOn('2026-05-22') === 'שבועות', String(holidayOn('2026-05-22')))
  check('A258 · le 1er Tishri (ראש השנה) est fermé',
    holidayOn('2026-09-12') === 'ראש השנה', String(holidayOn('2026-09-12')))
  check('A258 · un mardi ordinaire n\'est pas une fête',
    holidayOn('2026-11-17') === null && isAvailableDay('2026-11-17'))
  check('A258 · huit jours de fête nommés, en dates HÉBRAÏQUES',
    JEWISH_HOLIDAYS.length === 8 &&
      JEWISH_HOLIDAYS.every((h) => typeof h.month === 'string' && h.day > 0),
    JEWISH_HOLIDAYS.map((h) => `${h.day} ${h.month}`).join(' · '))

  /* Les créneaux eux-mêmes, sur trente jours. */
  const from = new Date('2026-09-25T06:00:00Z')
  const slots = freeSlots([], from)
  const badDay = slots.filter((s) => !isAvailableDay(s.dayKey))
  check('A258 · aucun créneau proposé un jour fermé, sur tout l\'horizon',
    badDay.length === 0, badDay.map((s) => s.dayKey).join(' · '))
  check('A258 · et rien avant le délai de 24 h',
    slots.every(
      (s) => new Date(s.startAt).getTime() >= from.getTime() + APPOINTMENT_LEAD_HOURS * 3600_000,
    ))
  check('A258 · ni au-delà de l\'horizon',
    slots.every((s) => s.dayKey <= dayKeyAfter(from, APPOINTMENT_HORIZON_DAYS)),
    `${slots[0]?.dayKey} … ${slots[slots.length - 1]?.dayKey}`)
  const perDay = (APPOINTMENT_DAY_END_HOUR - APPOINTMENT_DAY_START_HOUR) /
    (APPOINTMENT_SLOT_MINUTES / 60)
  check('A258 · la journée porte le nombre de créneaux annoncé par ses constantes',
    slots.filter((s) => s.dayKey === slots[1]?.dayKey).length === perDay, String(perDay))

  /* ⚠️ « DÉJÀ PRIS » SE TESTE PAR CHEVAUCHEMENT, PAS PAR ÉGALITÉ D'HEURE : une
     garde de 21:00 à 05:00 ne commence dans aucun créneau du lendemain et les
     occupe pourtant tous. */
  const day = dayKeyAfter(from, 3)
  const night = {
    startAt: jerusalemInstant(day, 6).toISOString(),
    endAt: jerusalemInstant(day, 23).toISOString(),
  }
  const withNight = freeSlots([night], from)
  check('A258 · une occupation qui recouvre la journée en efface tous les créneaux',
    withNight.filter((s) => s.dayKey === day).length === 0)
  check('A258 · et ne touche pas les autres jours',
    withNight.filter((s) => s.dayKey !== day).length === slots.length - perDay)

  /* Une entrée PONCTUELLE (une visite) occupe quand même sa durée. */
  const point = {
    startAt: jerusalemInstant(day, 10).toISOString(),
    endAt: jerusalemInstant(day, 10).toISOString(),
  }
  const withPoint = freeSlots([point], from)
  check('A258 · une visite (un point) occupe BUSY_MIN_MINUTES, pas zéro minute',
    !withPoint.some((s) => s.dayKey === day && s.label === '10:00') && BUSY_MIN_MINUTES > 0,
    `${BUSY_MIN_MINUTES} min`)
  check('A258 · et elle ne mange que son créneau',
    withPoint.filter((s) => s.dayKey === day).length === perDay - 1)

  /* ⚠️ TOUT EST À L'HEURE DE JÉRUSALEM, JAMAIS À CELLE DE LA MACHINE. Cette
     porte tourne souvent sur une machine en UTC ; si les créneaux suivaient
     l'horloge locale, « 09:00 » serait 11:00 à Jérusalem l'été. */
  const nine = jerusalemInstant('2026-07-14', 9)
  check('A258 · 09:00 à Jérusalem en juillet = 06:00 UTC (heure d\'été, +3)',
    nine.toISOString() === '2026-07-14T06:00:00.000Z', nine.toISOString())
  const nineWinter = jerusalemInstant('2026-12-15', 9)
  check('A258 · et 07:00 UTC en décembre (heure d\'hiver, +2)',
    nineWinter.toISOString() === '2026-12-15T07:00:00.000Z', nineWinter.toISOString())
  check('A258 · le jour de Jérusalem d\'un instant tardif n\'est pas celui d\'UTC',
    jerusalemDayKey(new Date('2026-07-14T22:30:00Z')) === '2026-07-15',
    jerusalemDayKey(new Date('2026-07-14T22:30:00Z')))

  /* Et le SQL barre le même chemin de son côté. */
  check('A258 · le SQL refuse un vendredi ou un samedi à l\'écriture',
    /extract\(dow from v_appt at time zone 'Asia\/Jerusalem'\) in \(5, 6\)/.test(MIGRATION))
  check('A258 · et il revérifie que le créneau est encore libre',
    MIGRATION.includes("raise exception 'appointmentTaken'"))
  check('A258 · les trois sources de l\'agenda sont interrogées',
    MIGRATION.includes('public.missions') &&
      MIGRATION.includes('public.general_meetings') &&
      MIGRATION.includes('public.farm_visits'))
  check('A258 · et `public_busy_intervals` ne rend QUE deux dates',
    /returns table \(starts_at timestamptz, ends_at timestamptz\)/.test(MIGRATION))
}

// ---------------------------------------------------------------------------
section('A260 — les deux moitiés d\'une même règle sont égales')
// ---------------------------------------------------------------------------
{
  /**
   * ⚠️ TOUTE RÈGLE ÉCRITE DEUX FOIS FINIT PAR ÊTRE ÉCRITE DE DEUX FAÇONS. Ce
   *    bloc est la seule chose qui empêche la moitié SQL et la moitié
   *    TypeScript de diverger en silence — un plafond relevé d'un côté et pas
   *    de l'autre, c'est un refus que le lecteur ne comprend pas.
   */
  check('A260 · le plafond d\'un document est le MÊME nombre en SQL et en TS',
    MIGRATION.includes(`:= ${MAX_DOCUMENT_BYTES};`),
    `${MAX_DOCUMENT_BYTES} octets`)
  check('A260 · le nombre de documents aussi',
    MIGRATION.includes(`:= ${MAX_DOCUMENTS};`), String(MAX_DOCUMENTS))
  check('A260 · et le SQL nomme les constantes TS qu\'il double',
    MIGRATION.includes('MAX_DOCUMENT_BYTES') && MIGRATION.includes('MAX_DOCUMENTS'))

  /* Le texte de l'accord : une seule source (AH5), donc deux copies égales. */
  check('A260 · le texte livré de l\'accord est MOT POUR MOT celui de he.json',
    shipped === shippedAgreementTemplate(),
    shipped === shippedAgreementTemplate() ? '' : 'régénérer : bun run apshipped')
  check('A260 · et c\'est bien le gabarit que lit l\'application',
    shipped === he.settings.agreementDoc.defaultTemplate)
  /* ⚠️ ET LA SURCHARGE DU PO EST LUE SOUS SA VRAIE CLÉ. Une faute de frappe
     ici rendrait `null` pour toujours, et la page afficherait éternellement le
     texte livré sans que rien ne le signale. */
  check('A260 · la fonction SQL lit la clé exacte de `ui/settings/sync.ts`',
    MIGRATION.includes("'lo-yanum:agreement-doc-template'") &&
      readFileSync('src/ui/settings/sync.ts', 'utf8').includes("'lo-yanum:agreement-doc-template'"))

  /* La table des claviers : UNE, dans le cœur, lue par les deux produits. */
  const fields = readFileSync('src/ui/components/fields.tsx', 'utf8')
  check('A260 · `fields.tsx` ne redéfinit plus la table, il la réexporte',
    fields.includes("export { KIND_DOM, kindInputProps } from '@core/fieldKind'") &&
      !/const KIND_DOM: Record<FieldKind, KindDom> = \{/.test(fields))
  const app = readFileSync('src/bakasha/App.tsx', 'utf8')
  check('A260 · et la page publique lit la MÊME table',
    app.includes("from '@core/fieldKind'") && app.includes('kindInputProps('))
  check('A260 · le נייד se met en forme à la frappe des deux côtés',
    KIND_DOM.phone.show?.('0525274774') === '(052) 527-4774',
    KIND_DOM.phone.show?.('0525274774'))

  /**
   * La page ne doit pas emporter l'application avec elle.
   *
   * ⚠️ ON LIT LES `import`, PAS LE TEXTE DU FICHIER, ET LA PREMIÈRE ÉCRITURE
   *    DE CETTE PORTE S'EST TROMPÉE DESSUS. Les en-têtes de `Signature.tsx` et
   *    d'`api.ts` EXPLIQUENT pourquoi ils n'emploient ni `react-i18next` ni
   *    `@supabase/supabase-js` — donc un `includes` sur le texte entier
   *    trouvait les deux noms et déclarait rouge la page qui fait exactement
   *    ce qu'on lui demande. Un commentaire qui nomme ce qu'il refuse est
   *    précisément ce qu'on veut lire ; il ne doit pas faire échouer la porte.
   */
  const bakashaImports = ['App.tsx', 'Documents.tsx', 'Appointment.tsx', 'Agreement.tsx', 'Signature.tsx', 'api.ts', 'main.tsx', 'text.ts']
    .flatMap((f) =>
      [...readFileSync(`src/bakasha/${f}`, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^\n]*from\s+'([^']+)'/g)]
        .map((m) => m[1]),
    )
  const forbidden = ['react-i18next', 'i18next', '@core/index', '@supabase/supabase-js', '@core/store']
  const smuggled = bakashaImports.filter((i) => forbidden.includes(i))
  check('A260 · la page publique n\'IMPORTE ni i18next, ni le barillet @core/index',
    !smuggled.includes('react-i18next') && !smuggled.includes('i18next') && !smuggled.includes('@core/index'),
    smuggled.join(' · '))
  check('A260 · ni `@supabase/supabase-js` (100 ko pour trois `fetch`)',
    !smuggled.includes('@supabase/supabase-js'), bakashaImports.join(' · '))
  check('A260 · ni le magasin, ni un service worker',
    !smuggled.includes('@core/store') &&
      !['App.tsx', 'main.tsx'].some((f) =>
        readFileSync(`src/bakasha/${f}`, 'utf8').includes('navigator.serviceWorker')))
}

// ---------------------------------------------------------------------------
section('A261 — « בקשה נכנסת » est passée par toutes les listes fermées')
// ---------------------------------------------------------------------------
{
  /**
   * ⚠️ RÈGLE 10 DE PROJECT_STATE.md : « ajouter une valeur à un ensemble fermé
   *    = faire le tour des portes qui l'énumèrent ». En AO, deux teintes
   *    neuves ont vécu une passe entière sans être mesurées — et elles
   *    ÉCHOUAIENT. Ce bloc est la liste, écrite.
   */
  check('A261 · le statut existe et il est en TÊTE de la liste de référence',
    ALL_FARM_STATUSES[0] === 'incoming_request' && ALL_FARM_STATUSES.length === 10,
    ALL_FARM_STATUSES.join(' · '))
  check('A261 · il n\'est NI dans le pipeline NI dans les hors-pipeline',
    !FARM_PIPELINE.includes('incoming_request') &&
      !FARM_STATUSES_OFF_PIPELINE.includes('incoming_request') &&
      FARM_STATUSES_INTAKE.includes('incoming_request'))
  check('A261 · et il COMPTE dans les compteurs, contrairement aux deux d\'AO2',
    countsTowardProgramme('incoming_request') &&
      !countsTowardProgramme('on_hold') &&
      !countsTowardProgramme('not_relevant_now'))
  check('A261 · `scripts/live.ts` demande les DIX étiquettes à la base',
    readFileSync('scripts/live.ts', 'utf8').includes("'incoming_request', 'to_contact'"))
  check('A261 · `scripts/contrast.ts` mesure la teinte neuve',
    readFileSync('scripts/contrast.ts', 'utf8').includes("'farm-incoming-request'"))
  const tokens = readFileSync('src/styles/tokens.css', 'utf8')
  check('A261 · la teinte est définie en clair, en sombre, ET dans la requête média',
    (tokens.match(/--farm-incoming-request:/g) ?? []).length === 3,
    `${(tokens.match(/--farm-incoming-request:/g) ?? []).length} définitions`)
  check('A261 · son encre aussi',
    (tokens.match(/--farm-incoming-request-ink:/g) ?? []).length === 3)
  check('A261 · Tailwind expose la paire',
    readFileSync('tailwind.config.js', 'utf8').includes("'incoming-request': token('farm-incoming-request')"))
  check('A261 · le styleguide montre les DIX teintes (il était resté à sept depuis AO)',
    (readFileSync('src/ui/screens/StyleguideScreen.tsx', 'utf8')
      .match(/'farm-[a-z-]+',/g) ?? []).length === 10)
  check('A261 · il porte un libellé hébreu',
    he.farmStatus.incoming_request === 'בקשה נכנסת', he.farmStatus.incoming_request)
  check('A261 · le rapport d\'activité sait le nommer, en WhatsApp et en PDF',
    readFileSync('src/ui/report/activityText.ts', 'utf8').includes("incoming_request: 'בקשה נכנסת'") &&
      readFileSync('src/ui/report/activityDraw.ts', 'utf8').includes("incoming_request: 'בקשה נכנסת'"))
  check('A261 · l\'écran חוות porte une file dédiée',
    readFileSync('src/ui/screens/coordinator/FarmsListScreen.tsx', 'utf8')
      .includes("testId=\"farms-intake\""))
  check('A261 · et la migration l\'ajoute sans l\'employer dans la même transaction',
    readFileSync('supabase/migrations/20260925000100_status_incoming_request.sql', 'utf8')
      .includes("alter type farm_status add value if not exists 'incoming_request'"))
}

// ---------------------------------------------------------------------------
section('A262 — la surface anonyme est aussi étroite que possible')
// ---------------------------------------------------------------------------
{
  /**
   * ⚠️ TROUVÉ EN AP4.4 : `anon` avait DELETE/INSERT/SELECT/UPDATE/TRUNCATE sur
   *    les TRENTE tables de `public`, par les privilèges par défaut du schéma.
   *    RLS tenait la porte et `bun run auth` était vert — mais une clé `anon`
   *    va désormais être PUBLIÉE. Le refus doit être par DROIT.
   */
  const revoke = readFileSync('supabase/migrations/20260925000300_revoke_anon_everywhere.sql', 'utf8')
  check('A262 · les droits de table d\'`anon` sont révoqués sur tout le schéma',
    revoke.includes('revoke all privileges on all tables in schema public from anon'))
  check('A262 · et les tables À VENIR naissent fermées',
    revoke.includes('alter default privileges in schema public revoke all on tables from anon'))
  check('A262 · `usage` sur le schéma est CONSERVÉ (sinon les RPC tombent)',
    revoke.includes('grant usage on schema public to anon'))
  /* ⚠️ UNE INSTRUCTION À LA FOIS. La première écriture cherchait `grant … to
     anon` avec un `[\s\S]*?` au milieu : il traversait les points-virgules et
     rattachait le `grant select … to authenticated` de la table au `to anon`
     d'une fonction trente lignes plus bas. Une porte qui lit deux instructions
     comme une seule accuse du code innocent. */
  const anonGrants = MIGRATION.split(';')
    .map((st) => st.trim())
    .filter((st) => /^grant\b/.test(st) && /\bto anon$/.test(st))
  check('A262 · la migration d\'AP n\'accorde à `anon` que des `execute`',
    anonGrants.length > 0 && anonGrants.every((st) => /^grant execute on function\b/.test(st)),
    anonGrants.join(' | '))
  const anonFns = [...MIGRATION.matchAll(/grant execute on function (public\.[a-z_]+)\([^)]*\) to anon/g)]
    .map((m) => m[1])
  check('A262 · TROIS fonctions, et trois seulement',
    anonFns.length === 3 &&
      anonFns.includes('public.submit_aid_request') &&
      anonFns.includes('public.public_busy_intervals') &&
      anonFns.includes('public.public_agreement_template'),
    anonFns.join(' · '))
  const policies = MIGRATION.split(';')
    .map((st) => st.trim())
    .filter((st) => /^create policy\b/.test(st))
  check('A262 · aucune politique RLS de la table neuve ne vise `anon`',
    policies.length === 4 && policies.every((st) => /\bto authenticated\b/.test(st) && !/\banon\b/.test(st)),
    `${policies.length} politiques`)
  /* ⚠️ SUR LES LIGNES DE CODE SEULEMENT : l'en-tête du fichier EXPLIQUE la
     règle en la citant, ce qui donnait quatre occurrences pour trois
     fonctions. Le même piège que ci-dessus. */
  const codeLines = MIGRATION.split('\n').filter((l) => !l.trimStart().startsWith('--'))
  check('A262 · les trois fonctions figent leur `search_path`',
    codeLines.filter((l) => l.trim() === "set search_path = ''").length === 3,
    String(codeLines.filter((l) => l.trim() === "set search_path = ''").length))
  check('A262 · et il y a un garde-fou de débit',
    MIGRATION.includes('max_per_phone_day'))
  /* La table neuve porte ses autorisations dans SA migration (règle AO0). */
  check('A262 · `aid_requests` porte ses `grant` dans la migration qui la crée',
    MIGRATION.includes('grant select, insert, update, delete on public.aid_requests to authenticated') &&
      MIGRATION.includes('grant select, insert, update, delete on public.aid_requests to service_role'))
  check('A262 · avec RLS activée ET forcée',
    MIGRATION.includes('alter table public.aid_requests enable row level security') &&
      MIGRATION.includes('alter table public.aid_requests force row level security'))
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
