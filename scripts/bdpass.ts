import { readFileSync } from 'node:fs'

import { geocoderQuery, localPointForAddress, readGeocoderReply } from '../src/core/addressPoint'
import { FARM_BRANCHES, branchLayerKeys, pinGlyphFor } from '../src/core/branches'
import type { FarmBranch } from '../src/core/branches'
import { WORK_ROUTES, dashboardBlocks, funnel, isCoordinationPending, isInstitutionWithoutCoordinator, isLeadListedOpen, isLeadStale, isReadyToSign, workList } from '../src/core/dashboard'
import {
  KNOWN_PHONE_LABELS,
  contactPhones,
  foldLegacyOffice,
  institutionHead,
  institutionHeads,
  institutionSecretariats,
  isInstitutionHeadMissing,
  isSecretariatEntry,
  phoneLabelChoices,
  settleInstitution,
  sortInstitutionContacts,
} from '../src/core/institutions'
import type { Institution, InstitutionContact } from '../src/core/institutions'
import { statusLegend } from '../src/core/mapLegend'
import { isContactEstablished } from '../src/core/people'
import { ALL_FARM_STATUSES } from '../src/core/types'
import type { Farm, FarmStatus, Lead } from '../src/core/types'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BD — PORTE PURE.   bun run bdpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tous les noms et numéros ici sont INVENTÉS (050-000-10xx, 08-600-10xx) : le
 * dépôt ne porte aucune donnée réelle.
 *
 *   A427  les étiquettes de numéro : נייד · בית · משרד · מזכירות, liste ouverte ;
 *         une entrée SANS NOM est acceptée ; une entrée de secrétariat ne prend
 *         pas de rang et n'apparaît jamais à la place du contact de tête ; les
 *         données de l'ancien champ sont migrées (lecture ET SQL) ; le champ
 *         dédié a disparu du modèle et de l'interface
 *   A428  l'icône d'une épingle : une nature → son icône, deux → la première,
 *         aucune (ou « אחר ») → la générique ; un moshav garde son village ;
 *         les replis par nature
 *   A429  le tableau de bord : un bloc sans contenu n'est pas rendu, et chaque
 *         compte est celui de la liste filtrée (même prédicat, même adresse)
 *   A430  la légende : seuls les statuts présents, avec leur compte ; les vides
 *         repliés, aucun statut supprimé
 *   A431  l'adresse propose un point : coordonnées collées, la réponse du
 *         géocodeur (hors d'Israël refusée), sinon la localité
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
const src = (p: string) => readFileSync(p, 'utf8')

const store = await import('../src/core/store')
const baseInst = store._raw().institutions[0]
const inst = (over: Partial<Institution>): Institution => ({ ...structuredClone(baseInst), id: 'inst-bd', contacts: [], contactName: '', contactPhone: '', ...over })
const c = (id: string, role: InstitutionContact['role'], name: string, phone = '', extra: Partial<InstitutionContact> = {}): InstitutionContact => ({ id, role, name, phone, note: '', ...extra })
const office = (id: string, number: string): InstitutionContact => ({ id, role: 'contact', name: '', phone: number, phones: [{ number, label: 'secretariat' }], note: '' })
const baseFarm = store._raw().farms[0]
const farm = (over: Partial<Farm>): Farm => ({ ...structuredClone(baseFarm), contacts: [], ...over })

// ---------------------------------------------------------------------------
section('A427 — le secrétariat est une entrée étiquetée, pas un champ')
// ---------------------------------------------------------------------------
{
  check('A427 les étiquettes connues : נייד · בית · משרד · מזכירות', KNOWN_PHONE_LABELS.join(',') === 'mobile,home,office,secretariat')
  const he = JSON.parse(src('src/locales/he.json')) as { institutions: { phoneLabel: Record<string, string> } }
  check('A427 … et leurs mots', ['נייד', 'בית', 'משרד', 'מזכירות'].every((w, n) => he.institutions.phoneLabel[KNOWN_PHONE_LABELS[n]] === w), JSON.stringify(he.institutions.phoneLabel))
  const fax: Institution = inst({ contacts: [c('p', 'head', 'ראש הדגמה', '', { phones: [{ number: '050-0001001', label: 'mobile' }, { number: '08-6001002', label: 'פקס' }] })] })
  const choices = phoneLabelChoices([fax])
  check('A427 la liste est OUVERTE : une étiquette saisie (« פקס ») est proposée ensuite, sans code', choices.includes('פקס') && choices.slice(0, 4).join(',') === 'mobile,home,office,secretariat', choices.join(','))
  const row = MAPPINGS.institutions.toRows(settleInstitution(fax))[0].rows[0] as Record<string, unknown>
  const back = MAPPINGS.institutions.fromRows(JSON.parse(JSON.stringify(row)), {} as never) as Institution
  check('A427 une étiquette saisie fait l’aller-retour en base', contactPhones(back.contacts![0]).some((p) => p.label === 'פקס'))

  // Une entrée sans nom est acceptée.
  const lone = settleInstitution(inst({ contacts: [office('o', '08-6001010')] }))
  check('A427 une entrée SANS NOM est acceptée (gardée, son numéro aussi)', lone.contacts!.length === 1 && lone.contacts![0].name === '' && contactPhones(lone.contacts![0])[0]?.number === '08-6001010')
  check('A427 … c’est un secrétariat', isSecretariatEntry(lone.contacts![0]) && institutionSecretariats(lone).length === 1)
  check('A427 … qui ne remplace pas le contact de tête : « חסר ראש ישיבה »', isInstitutionHeadMissing(lone) && lone.contactName === '' && lone.contactPhone === '', `${lone.contactName}|${lone.contactPhone}`)

  // Même avec un rôle de tête posé par erreur, un secrétariat n'est jamais la tête.
  const wrongRole = settleInstitution(inst({ contacts: [{ ...office('o', '08-6001011'), role: 'head' }, c('r', 'ram', 'הרב רם הדגמה', '050-0001012')] }))
  check('A427 un secrétariat étiqueté « tête » par erreur n’est PAS un contact de tête', institutionHeads(wrongRole).length === 0 && institutionHead(wrongRole) === null && wrongRole.contactPhone === '')
  const withHead = settleInstitution(inst({ contacts: [office('o', '08-6001013'), c('h', 'head', 'ראש הדגמה', '050-0001014')] }))
  check('A427 avec un contact de tête, la liste montre LUI (jamais le secrétariat)', withHead.contactName === 'ראש הדגמה' && withHead.contactPhone === '050-0001014')
  const sorted = sortInstitutionContacts([office('o', '08-6001015'), c('x', 'contact', 'איש קשר הדגמה'), c('h', 'head', 'ראש הדגמה'), c('k', 'coordinator', 'רכז הדגמה')])
  check('A427 le secrétariat ne prend pas de rang : APRÈS toutes les personnes', sorted[sorted.length - 1].id === 'o', sorted.map((x) => x.id).join(','))
  const twoCoord = settleInstitution(inst({ contacts: [{ ...office('o', '08-6001016'), role: 'coordinator' }, c('k', 'coordinator', 'רכז הדגמה', '050-0001017')] }))
  check('A427 … et ne compte pas pour le רכז unique (le vrai רכז n’est pas rétrogradé)', twoCoord.contacts!.find((x) => x.id === 'k')?.role === 'coordinator')
  const pending = settleInstitution(inst({ contacts: [c('p', 'head', '', '', { phones: [{ number: '050-0001018', label: 'mobile' }] })] }))
  check('A427 un numéro de portable tapé avant le nom reste une PERSONNE (son rôle tient)', !isSecretariatEntry(pending.contacts![0]) && institutionHeads(pending).length === 1)
  const mixed = contactPhones({ phone: '', phones: [{ number: '08-6001019', label: 'secretariat' }, { number: '050-0001020', label: 'mobile' }] })
  check('A427 sur une personne, le portable passe avant le numéro de secrétariat', mixed[0].number === '050-0001020')

  // Migration de l'ancien champ — à la lecture.
  const legacyRow = { ...row, id: 'inst-bd-old', contacts: [{ id: 'h', role: 'head', name: 'ראש הדגמה', phone: '050-0001021', note: '' }], office_phone: '08-6001022', office_address: 'רחוב ההדגמה 1, אופקים', address: undefined }
  const folded = MAPPINGS.institutions.fromRows(JSON.parse(JSON.stringify(legacyRow)), {} as never) as Institution
  check('A427 lecture d’une ligne d’avant BD : le numéro devient une entrée « מזכירות »', institutionSecretariats(folded).length === 1 && contactPhones(institutionSecretariats(folded)[0])[0].number === '08-6001022')
  check('A427 … l’adresse devient celle du lieu', folded.address === 'רחוב ההדגמה 1, אופקים', folded.address)
  check('A427 … et le contact de tête reste celui des listes', folded.contactName === 'ראש הדגמה' && folded.contactPhone === '050-0001021')
  const rewritten = MAPPINGS.institutions.toRows(folded)[0].rows[0] as Record<string, unknown>
  check('A427 l’écriture ne porte plus le champ dédié', !('office_phone' in rewritten) && !('office_address' in rewritten) && rewritten.address === 'רחוב ההדגמה 1, אופקים')
  const again = MAPPINGS.institutions.fromRows({ ...JSON.parse(JSON.stringify(rewritten)), office_phone: '08-6001022' }, {} as never) as Institution
  check('A427 relue avec le vieux numéro encore là : pas de doublon', institutionSecretariats(again).length === 1, `${institutionSecretariats(again).length}`)
  const dup = foldLegacyOffice(inst({ contacts: [c('h', 'head', 'ראש הדגמה', '08-600-1023')] }), '086001023', '')
  check('A427 un numéro déjà porté par un contact n’est pas recopié (mêmes chiffres)', (dup.contacts ?? []).length === 1)
  const keep = foldLegacyOffice(inst({ address: 'כתובת קיימת' }), '', 'כתובת ישנה')
  check('A427 une adresse du lieu déjà saisie n’est pas écrasée', keep.address === 'כתובת קיימת')

  // Migration SQL.
  const mig = src('supabase/migrations/20261013000200_bd_secretariat_into_contacts.sql').replace(/--[^\n]*/g, '')
  check('A427 la migration SQL replie le numéro (étiquette secretariat, sans nom, mêmes chiffres)', /'label', 'secretariat'/.test(mig) && /'name', ''/.test(mig) && /regexp_replace\(.*\\D/.test(mig))
  check('A427 … reprend l’adresse, vérifie qu’aucun numéro n’est perdu, PUIS supprime le champ', /set address = office_address/.test(mig) && mig.indexOf('raise exception') < mig.indexOf('drop column office_phone') && /drop column office_address/.test(mig))
  check('A427 … et n’ouvre rien à `anon`', !/grant|anon\b/i.test(mig))
  const add = src('supabase/migrations/20261013000100_bd_institution_address.sql').replace(/--[^\n]*/g, '')
  check('A427 la colonne `address` est additive', /add column if not exists address/.test(add) && !/drop|grant/i.test(add))

  // Le champ dédié a disparu.
  const model = src('src/core/institutions.ts')
  const ui = src('src/ui/institutions/institutionUi.tsx')
  const iface = model.slice(model.indexOf('export interface Institution {'), model.indexOf('export const needsPriorCoordination'))
  check('A427 le modèle n’a plus `officePhone` ni `officeAddress`', !/officePhone|officeAddress/.test(iface))
  check('A427 l’interface ne les lit plus', !/officePhone|officeAddress|institution-office/.test(ui))
  check('A427 « הוספת מזכירות » : le geste qui crée l’entrée', /institution-secretariat-add/.test(ui) && /SECRETARIAT_LABEL/.test(ui))
}

// ---------------------------------------------------------------------------
section('A428 — l’icône d’une épingle')
// ---------------------------------------------------------------------------
{
  const b = (...kinds: FarmBranch['kind'][]): FarmBranch[] => kinds.map((kind) => ({ kind }))
  check('A428 une nature donne son icône (בקר → la vache)', pinGlyphFor({ branches: b('cattle') }) === 'cattle')
  const expect: Record<string, string> = { cattle: 'cattle', sheep: 'sheep', orchards: 'orchards', vineyard: 'vineyard', fieldCrops: 'fieldCrops', vegetables: 'vegetables', therapeutic: 'therapeutic', poultry: 'poultry', other: 'farm' }
  check('A428 chacune des neuf natures (אחר → la générique)', FARM_BRANCHES.every((k) => pinGlyphFor({ branches: b(k) }) === expect[k]))
  check('A428 deux natures donnent la PREMIÈRE de la liste (צאן + בקר → בקר)', pinGlyphFor({ branches: b('sheep', 'cattle') }) === 'cattle')
  check('A428 … même « à confirmer »', pinGlyphFor({ branches: [{ kind: 'vineyard', toConfirm: true }] }) === 'vineyard')
  check('A428 aucune nature donne la silhouette générique', pinGlyphFor({ branches: [] }) === 'farm' && pinGlyphFor({}) === 'farm')
  check('A428 un moshav garde son village', pinGlyphFor({ entityKind: 'moshav', branches: b('cattle') }) === 'moshav')
  check('A428 les replis : chaque nature, ou « sans nature »', branchLayerKeys({ branches: b('cattle', 'fieldCrops') }).join(',') === 'branch:cattle,branch:fieldCrops' && branchLayerKeys({}).join(',') === 'branch:none')
  const canvas = src('src/ui/components/MapCanvas.tsx')
  check('A428 chaque icône est dessinée (une entrée de GLYPH par nature)', ['cattle', 'sheep', 'orchards', 'vineyard', 'fieldCrops', 'vegetables', 'therapeutic', 'poultry', 'farm', 'institution', 'lead'].every((k) => new RegExp(`\\n  ${k}:`).test(canvas)))
  check('A428 aucune icône composite : une seule clé `glyph` par épingle', !/glyph:\s*\[/.test(src('src/ui/components/placeMarkers.ts')))
}

// ---------------------------------------------------------------------------
section('A429 — le tableau de bord : rien de vide, chaque compte est sa liste')
// ---------------------------------------------------------------------------
{
  const now = Date.parse('2026-10-12T09:00:00.000Z')
  const farms = [
    farm({ id: 'f1', status: 'verbal_ok' }),
    farm({ id: 'f2', status: 'verbal_ok', contactEstablished: false }),
    farm({ id: 'f3', status: 'signed' }),
    farm({ id: 'f4', status: 'to_contact', contactEstablished: false }),
    farm({ id: 'test-f5', status: 'verbal_ok' }),
  ]
  const institutions = [
    inst({ id: 'i1', engagement: 'signed', contacts: [c('k', 'coordinator', 'רכז הדגמה')] }),
    inst({ id: 'i2', engagement: 'interested', contacts: [c('h', 'head', 'ראש הדגמה')] }),
    inst({ id: 'i3', engagement: 'not_contacted', coordinationRequired: true, contacts: [{ ...office('o', '08-6001030'), role: 'coordinator' }] }),
    inst({ id: 'i4', engagement: 'not_relevant' }),
    inst({ id: 'i5', engagement: 'contacted', coordinationRequired: true }),
  ]
  const lead = (id: string, createdAt: string, status: Lead['status'] = 'not_called', convertedFarmId: string | null = null): Lead =>
    ({ ...structuredClone(store._raw().leads[0] ?? ({} as Lead)), id, createdAt, status, convertedFarmId } as Lead)
  const leads = [lead('l1', '2026-09-20T08:00:00.000Z'), lead('l2', '2026-10-10T08:00:00.000Z'), lead('l3', '2026-09-01T08:00:00.000Z', 'not_now'), lead('l4', '2026-09-01T08:00:00.000Z', 'not_called', 'f1')]
  const source = { farms, institutions, leads, nowMs: now }
  const work = workList(source)
  const byKey = Object.fromEntries(work.map((w) => [w.key, w]))
  const listed = {
    institutionsNoCoordinator: institutions.filter((i) => !i.id.startsWith('test-') && isInstitutionWithoutCoordinator(i)).map((i) => i.id),
    farmsNotContacted: farms.filter((f) => !f.id.startsWith('test-') && !isContactEstablished(f)).map((f) => f.id),
    agreementsToSign: farms.filter((f) => !f.id.startsWith('test-') && isReadyToSign(f)).map((f) => f.id),
    coordinationPending: institutions.filter(isCoordinationPending).map((i) => i.id),
    staleLeads: leads.filter((l) => isLeadStale(l, now)).map((l) => l.id),
  }
  check('A429 institutions sans רכז : i2, i3 (le « רכז » de i3 est un secrétariat), i5 ; i4 « לא רלוונטי » exclue', listed.institutionsNoCoordinator.join(',') === 'i2,i3,i5' && byKey.institutionsNoCoordinator?.count === 3)
  check('A429 fermes « טרם נוצר קשר » : 2', byKey.farmsNotContacted?.count === 2 && listed.farmsNotContacted.length === 2)
  check('A429 accords prêts à signer : 2 (le jeu d’essai ne compte pas)', byKey.agreementsToSign?.count === 2)
  check('A429 coordination préalable non traitée : 1 (i3 ; i5 a déjà été contactée)', byKey.coordinationPending?.count === 1 && listed.coordinationPending.join(',') === 'i3')
  check('A429 contacts ouverts depuis plus de deux semaines : 1 (l1 ; l3 « לא עכשיו », l4 devenu ferme)', byKey.staleLeads?.count === 1 && listed.staleLeads.join(',') === 'l1')
  check('A429 chaque compte = la longueur de SA liste filtrée', work.every((w) => w.count === listed[w.key].length))
  check('A429 chaque ligne mène à sa liste filtrée', work.every((w) => w.to === WORK_ROUTES[w.key]) && WORK_ROUTES.agreementsToSign === '/coordinator/farms?status=verbal_ok' && WORK_ROUTES.farmsNotContacted === '/coordinator/farms?filter=notContacted')
  const calm = workList({ farms: [farm({ id: 'g1', status: 'signed' })], institutions: [inst({ id: 'j1', engagement: 'signed', contacts: [c('k', 'coordinator', 'רכז הדגמה')] })], leads: [], nowMs: now })
  check('A429 une catégorie vide DISPARAÎT (rien à zéro)', calm.length === 0)
  const steps = funnel(source)
  check('A429 l’entonnoir, dans l’ordre : contacts → fermes → prêtes à signer → signées → actives', steps.map((s) => s.key).join(',') === 'leads,farms,readyToSign,signed,active')
  check('A429 … ses comptes', steps.map((s) => s.count).join(',') === `${leads.filter(isLeadListedOpen).length},4,2,1,0`, steps.map((s) => s.count).join(','))
  const quiet = dashboardBlocks({ requests: 0, work: [], guards: 0, alerts: 0, tonight: 0, guardedDunams: 0 })
  check('A429 sans demande, sans travail, sans garde : ces blocs ne sont pas rendus', !quiet.requests && !quiet.work && !quiet.guardCurve && !quiet.alerts && !quiet.tonight && !quiet.guardedFigures)
  check('A429 … le dounam, sa courbe, l’entonnoir et « היום שלי » restent', quiet.dunam && quiet.dunamCurve && quiet.funnel && quiet.myDay)
  const busy = dashboardBlocks({ requests: 2, work, guards: 1, alerts: 1, tonight: 1, guardedDunams: 10 })
  check('A429 dès qu’ils ont quelque chose à dire, ils réapparaissent', busy.requests && busy.work && busy.guardCurve && busy.alerts && busy.tonight && busy.guardedFigures)
  const dash = src('src/ui/screens/coordinator/DashboardScreen.tsx')
  check('A429 l’écran lit les MÊMES calculs (workList, funnel, dashboardBlocks), plus de rangée de KPI', /workList\(source\)/.test(dash) && /funnel\(source\)/.test(dash) && /dashboardBlocks\(/.test(dash) && !/kpi-row/.test(dash))
  const instScreen = src('src/ui/screens/coordinator/InstitutionsScreen.tsx')
  const leadScreen = src('src/ui/screens/coordinator/LeadsScreen.tsx')
  check('A429 les listes filtrent avec les MÊMES prédicats', /noCoordinator: isInstitutionWithoutCoordinator/.test(instScreen) && /coordinationPending: isCoordinationPending/.test(instScreen) && /isLeadStale\(l, nowMs\)/.test(leadScreen))
  check('A429 la courbe des gardes n’apparaît qu’à la première garde', /firstGuard &&/.test(src('src/ui/components/GrowthCharts.tsx')))
}

// ---------------------------------------------------------------------------
section('A430 — la légende ne liste plus le vide')
// ---------------------------------------------------------------------------
{
  const statuses: FarmStatus[] = ['signed', 'signed', 'verbal_ok', 'to_contact', 'verbal_ok', 'verbal_ok']
  const { present, empty } = statusLegend(statuses)
  check('A430 seuls les statuts présents, avec leur compte', present.map((r) => `${r.status}:${r.count}`).sort().join(',') === 'signed:2,to_contact:1,verbal_ok:3')
  check('A430 dans l’ordre du modèle', present.map((r) => r.status).join(',') === ALL_FARM_STATUSES.filter((s) => ['signed', 'verbal_ok', 'to_contact'].includes(s)).join(','))
  check('A430 les autres repliés, aucun supprimé', present.length + empty.length === ALL_FARM_STATUSES.length && empty.includes('active'))
  check('A430 une carte vide : rien de présent, tout replié', statusLegend([]).present.length === 0)
}

// ---------------------------------------------------------------------------
section('A431 — une adresse propose un point')
// ---------------------------------------------------------------------------
{
  const pasted = localPointForAddress('https://www.google.com/maps/@31.2512,34.7915,15z')
  check('A431 un lien de carte collé : ses coordonnées', pasted?.source === 'coords' && Math.abs((pasted?.position.lat ?? 0) - 31.2512) < 1e-6)
  const town = localPointForAddress('רחוב הדגמה 12, אופקים')
  check('A431 sans réseau : la localité trouvée DANS l’adresse (centre, approximatif)', town?.source === 'locality' && town.label === 'אופקים', JSON.stringify(town))
  const own = localPointForAddress('רחוב שלא קיים 4', 'ירוחם')
  check('A431 … sinon la localité de la fiche', own?.source === 'locality' && own.label === 'ירוחם')
  check('A431 rien de reconnu : pas de proposition', localPointForAddress('xyz') === null)
  const reply = readGeocoderReply([{ lat: '48.85', lon: '2.35', display_name: 'Paris' }, { lat: '31.2386', lon: '34.7869', display_name: 'הרצל, באר שבע, ישראל' }])
  check('A431 la réponse du géocodeur : le premier résultat EN ISRAËL (Paris refusé)', reply?.source === 'address' && Math.abs((reply?.position.lat ?? 0) - 31.2386) < 1e-6)
  check('A431 une réponse vide ou illisible : rien', readGeocoderReply([]) === null && readGeocoderReply({}) === null)
  check('A431 la requête porte la localité de la fiche si l’adresse ne la dit pas', geocoderQuery('הרצל 10', 'באר שבע') === 'הרצל 10, באר שבע' && geocoderQuery('הרצל 10, באר שבע', 'באר שבע') === 'הרצל 10, באר שבע')
  const geo = src('src/ui/geocode.ts')
  check('A431 un seul appel par geste (jamais à la frappe), avec un délai maximal', /AbortController/.test(geo) && /setTimeout\(\(\) => ctrl\.abort\(\)/.test(geo) && !/onChange/.test(geo))
  const pin = src('src/ui/components/PinMap.tsx')
  check('A431 la proposition n’est pas la position : il faut la valider', /pin-proposal-accept/.test(pin) && /onClick=\{\(\) => place\(proposal\.position\)\}/.test(pin))
  check('A431 l’appui long pose le point sur la carte de la fiche', /onLongPress=\{place\}/.test(pin) && /onLongPress\?: \(position: LatLng\) => void/.test(src('src/ui/components/MapCanvas.tsx')))
}

console.log(`\n  ${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
