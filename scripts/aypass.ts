import { readFileSync } from 'node:fs'

import { draftsFromVcfFile, findDuplicates, mergePatch, parseVcf, photoOfCard } from '../src/core/contacts'
import type { ContactDraft } from '../src/core/contacts'
import { mergeSettings, STAMPED_ONLY_KEYS, SYNCED_SETTING_KEYS, THEME_SYNC_KEY } from '../src/ui/settings/sync'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AY — PORTE PURE.   bun run aypass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A357  le thème du coordinateur voyage ; un thème jamais choisi ne bouge pas
 *   A362  (code) toute suppression confirmée passe par l'annulation
 *   A363  (code) la carte de couverture n'a plus de filtres d'engagement
 *   A364  (code) le nom d'une institution n'est écrit sur la carte qu'au toucher
 *   A367  la photo d'une fiche .vcf (3.0, 2.1, 4.0) ; « X déjà présents sur Y » ;
 *         compléter sans rien écraser, écraser sur décision
 *   A369  (code) un seul écran d'import, un seul planificateur, durée par la route
 *   A355  (code) plus aucun `type="number"` dans l'application
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}
const read = (p: string) => readFileSync(p, 'utf8')

// ---------------------------------------------------------------------------
section('A357 — le thème du coordinateur voyage entre appareils')
// ---------------------------------------------------------------------------
check('A357 la clé du thème du coordinateur est synchronisée', SYNCED_SETTING_KEYS.includes(THEME_SYNC_KEY))
check('A357 … et ne voyage qu’une fois CHOISIE (instant posé)', STAMPED_ONLY_KEYS.has(THEME_SYNC_KEY))
{
  const blank = Object.fromEntries(SYNCED_SETTING_KEYS.map((k) => [k, null])) as Record<string, string | null>
  // Ordinateur : le PO vient de choisir « sombre » (instant posé). Téléphone : « clair », jamais choisi ici.
  const desk = { values: { ...blank, [THEME_SYNC_KEY]: 'dark' }, stamps: { [THEME_SYNC_KEY]: 2000 } }
  const phone = { values: { ...blank, [THEME_SYNC_KEY]: 'light' }, stamps: {} }
  const up = mergeSettings(desk, { values: blank, stamps: {} }, 0)
  check('A357 l’ordinateur fait monter son choix', up.push && up.pushed.includes(THEME_SYNC_KEY))
  const remote = { values: { ...blank, [THEME_SYNC_KEY]: 'dark' }, stamps: { [THEME_SYNC_KEY]: 2000 } }
  const down = mergeSettings(phone, remote, 0)
  check('A357 le téléphone reçoit le sombre', down.applied.includes(THEME_SYNC_KEY) && down.local.values[THEME_SYNC_KEY] === 'dark')
  // Avant AY : aucun instant nulle part — rien ne bouge (le premier appareil ne gagne pas par hasard).
  const legacy = mergeSettings(phone, { values: { ...blank, [THEME_SYNC_KEY]: 'dark' }, stamps: {} }, 0)
  check('A357 un thème jamais choisi (sans instant) n’écrase rien', !legacy.applied.includes(THEME_SYNC_KEY) && !legacy.pushed.includes(THEME_SYNC_KEY))
}

// ---------------------------------------------------------------------------
section('A367 — l’import de contacts : la photo, les doublons, trois choix')
// ---------------------------------------------------------------------------
const B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='.repeat(3)
const v30 = `BEGIN:VCARD\nVERSION:3.0\nFN:יוסי כהן\nTEL;type=CELL;waid=972501234567:+972 50-123-4567\nPHOTO;ENCODING=b;TYPE=JPEG:${B64}\nEND:VCARD`
const v21 = `BEGIN:VCARD\r\nVERSION:2.1\r\nN:לוי;דוד;;;\r\nTEL;CELL:0529876543\r\nPHOTO;JPEG;ENCODING=BASE64:${B64.slice(0, 60)}\r\n${B64.slice(60, 140)}\r\n${B64.slice(140)}\r\n\r\nEND:VCARD`
const v40 = `BEGIN:VCARD\nVERSION:4.0\nFN:משה פרץ\nTEL:+972541112233\nPHOTO:data:image/png;base64,${B64}\nEND:VCARD`
const vUrl = `BEGIN:VCARD\nVERSION:3.0\nFN:בלי תמונה\nTEL:0501111111\nPHOTO;VALUE=uri:https://example.invalid/me.jpg\nEND:VCARD`
check('A367 3.0 (WhatsApp, iPhone) : la photo est lue', photoOfCard(parseVcf(v30)[0]) === `data:image/jpeg;base64,${B64}`)
check('A367 2.1 (Android) : la photo en lignes NON indentées est recousue', photoOfCard(parseVcf(v21)[0]) === `data:image/jpeg;base64,${B64}`)
check('A367 4.0 : la photo en data URL est gardée', photoOfCard(parseVcf(v40)[0]) === `data:image/png;base64,${B64}`)
check('A367 une photo par adresse http n’est JAMAIS suivie', photoOfCard(parseVcf(vUrl)[0]) === null)
const many = draftsFromVcfFile([v30, v21, v40, vUrl].join('\n'), 'volunteer', 'lot.vcf')
check('A367 un fichier de quatre fiches : quatre brouillons, trois avec photo', many.drafts.length === 4 && many.drafts.filter((d) => d.photo).length === 3, `${many.drafts.length} / ${many.drafts.filter((d) => d.photo).length}`)

// « 15 déjà présents sur 20 »
const twenty = Array.from({ length: 20 }, (_, i) => `BEGIN:VCARD\nVERSION:3.0\nFN:מתנדב ${i + 1}\nTEL;type=CELL:05${String(10000000 + i).padStart(8, '0')}\nEND:VCARD`).join('\n')
const drafts = draftsFromVcfFile(twenty, 'volunteer', 'vingt.vcf').drafts
const existing = {
  leads: [],
  farms: [],
  institutions: [],
  volunteers: drafts.slice(0, 15).map((d, i) => ({ id: `vol-${i}`, name: `מתנדב ${i + 1}`, phone: d.phone })),
}
const dups = findDuplicates(drafts, existing, 'volunteer')
const present = dups.filter((x) => x && x.kind !== 'batch' && x.id).length
check('A367 vingt fiches, quinze connues : « 15 déjà présents sur 20 »', present === 15 && drafts.length === 20, `${present} sur ${drafts.length}`)
check('A367 chaque doublon désigne la fiche existante (pour la compléter)', dups.slice(0, 15).every((x, i) => x?.id === `vol-${i}`))

const draft = { ...drafts[0], photo: 'data:image/jpeg;base64,NOUVELLE', email: 'neuf@example.invalid' } as ContactDraft
const handTyped = { photo: null, phone: '050-0000000', email: 'saisi@example.invalid', place: 'אופקים' }
const fill = mergePatch(handTyped, draft, 'volunteer', 'fill')
check('A367 « compléter » : la photo manquante arrive', fill.photo === 'data:image/jpeg;base64,NOUVELLE')
check('A367 « compléter » : rien de ce que le PO a saisi n’est écrasé (téléphone, courriel, lieu)', !('phone' in fill) && !('email' in fill) && !('place' in fill), JSON.stringify(fill))
const over = mergePatch(handTyped, draft, 'volunteer', 'overwrite')
check('A367 « tout écraser » : la fiche importée remplace, sur DÉCISION', over.email === 'neuf@example.invalid' && over.phone === draft.phone)
check('A367 « ne créer que les nouveaux » : la fiche existante ne bouge pas', Object.keys(mergePatch(handTyped, draft, 'volunteer', 'skip')).length === 0)
const add = read('src/ui/screens/coordinator/AddContactsScreen.tsx')
check('A367 l’écran : une phrase et TROIS boutons (pas un questionnaire)', /add-existing-sentence/.test(add) && /\['skip', 'fill', 'overwrite'\] as const/.test(add))
check('A367 « compléter » est le choix par défaut (recommandé)', /useState<MergeMode>\('fill'\)/.test(add))

// ---------------------------------------------------------------------------
section('A355 · A362 · A363 · A364 — lus dans le code')
// ---------------------------------------------------------------------------
{
  const { execSync } = await import('node:child_process')
  const typeNumber = execSync(`grep -rln 'type="number"' src --include=*.tsx || true`).toString().trim().split('\n').filter((f) => f && !/NumericPad|PhoneChallenge/.test(f))
  check('A355 plus aucun champ type="number" (il refuse le vide et n’a pas de sélection)', typeNumber.length === 0, typeNumber.join(', '))
}
const confirm = read('src/ui/components/ConfirmDelete.tsx')
check('A362 toute suppression confirmée est encore défaisable 8 s (runUndoable)', /runUndoable\(/.test(confirm))
const toast = read('src/ui/components/UndoToast.tsx')
check('A362 une bande « ביטול » pour toute l’application, 8 secondes', /8000/.test(toast) && read('src/ui/App.tsx').includes('<UndoToast />'))
const cov = read('src/ui/screens/coordinator/CoverageScreen.tsx')
check('A363 la carte de couverture n’a plus de filtres d’engagement', !/institutions-filter/.test(cov) && !/INSTITUTION_ENGAGEMENTS\.map/.test(cov))
check('A363 … mais un RACCOURCI : un compte et le chemin vers מוסדות', /coverage-institutions-shortcut/.test(cov) && /to="\/coordinator\/institutions"/.test(cov))
check('A364 le nom d’une institution n’est écrit sur la carte qu’au toucher', /label: isSel \? p\.name : undefined/.test(cov))
check('A364 la fiche tient en quatre chiffres (volontaires, fermes, distance, borne)', ['coverage-fig-volunteers', 'coverage-fig-farms', 'coverage-fig-nearest', 'coverage-fig-limit'].every((x) => cov.includes(x)))

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
