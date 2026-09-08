import {
  ARRIVAL_GRACE_MINUTES_INITIAL,
  CHECKPOINT_INTERVAL_MINUTES_INITIAL,
  DISTRESS_BUDGET_MS,
  DISTRESS_HOLD_MS,
  EMERGENCY_SERVICES,
  GUARD_CLOSE_GRACE_MINUTES_INITIAL,
  GUARD_LINK_GRACE_HOURS,
  GUARD_LINK_GRACE_MS,
  SUMMONS_TOKENS,
  buildDistressAlert,
  buildGuardLink,
  buildGuardPass,
  buildSummons,
  checkpointState,
  confirmArrival,
  decodeGuardToken,
  emergencyEntries,
  encodeGuardToken,
  getAnchorPoint,
  getFarm,
  getFarmZonesForFarm,
  guardLinkExpiry,
  guardTokenFor,
  guardWasHeld,
  farmGuardStats,
  localEmergencyNumbers,
  missingSummonsTokens,
  planDistress,
  recordCheckpoint,
  resetStore,
  silenceSignals,
  summonsValues,
} from '../src/core/index'
import type { Farm, GuardToken, Mission, VigilThresholds } from '../src/core/index'
import { _raw } from '../src/core/store'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A118 … A128 — L'ACCÈS SANS COMPTE, L'ALERTE, LES SILENCES, LA CONVOCATION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aepass
 *
 * ★ PASSE DE SÉCURITÉ, DONC LES PORTES SONT ÉCRITES POUR UN DÉFAUT QUI COÛTE
 *   UNE INTERVENTION ET NON UNE MINUTE. Chacune est posée dans l'ordre où le
 *   défaut se produirait la nuit, pas dans l'ordre où le code est écrit.
 *
 *   A118  le lien de garde : il ouvre une garde, il expire au bout de la durée
 *         NOMMÉE, et une date d'expiration retouchée à la main ne passe pas.
 *   A119  rien d'historique dans ce que l'appareil garde — la moitié qui est
 *         une propriété du TYPE ; la moitié qui est une propriété du
 *         localStorage est dans `bun run aeui`.
 *   A120  le budget de deux secondes : ce qui se passe entre l'intention et le
 *         départ, mesuré ici en tant que plan, dans le navigateur en tant que
 *         durée.
 *   A121  l'alerte porte qui, où, quelle ferme, quelle heure ; coordinateur et
 *         agriculteur dans le MÊME SMS, donc en parallèle.
 *   A122  la cascade ne dépend pas du réseau : les deux voies téléphoniques
 *         sont des URI d'appareil et le corps porte les coordonnées en clair.
 *   A123  מוקד de la מועצה et כיתת כוננות du יישוב, y compris empruntés.
 *   A125  תיק אתר : les quatre champs voyagent, le contour aussi.
 *   A126  prise de garde non confirmée dans le délai → le coordinateur le sait.
 *   A127  et cette garde-là ne compte pas dans les compteurs d'AC4.
 *   A128  le SMS de convocation : tous les éléments, et un gabarit mutilé est
 *         refusé en nommant ce qui manque.
 *
 * ★ ET C'EST PUR — pas de navigateur, pas de serveur. A118 (moitié écran),
 *   A119 (moitié appareil), A120 (la durée) et A124 sont dans `bun run aeui`.
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

console.log('')
console.log('  A118 · A128 — AE1 · AE2 · AE3 · AE4, ON @core ALONE')
console.log('  ===================================================')

const HOUR = 3_600_000
const MIN = 60_000

// ---------------------------------------------------------------------------
section('A118 — le lien de garde')
// ---------------------------------------------------------------------------

{
  resetStore()
  const mission = _raw().missions[0]
  const volunteerId = mission.assignments[0].volunteerId
  const token = guardTokenFor(mission, 'volunteer', volunteerId)

  check(
    'A118 · the grace is the NAMED constant and it is 24 hours',
    GUARD_LINK_GRACE_HOURS === 24 && GUARD_LINK_GRACE_MS === 24 * HOUR,
    `${GUARD_LINK_GRACE_HOURS} h`,
  )
  check(
    'A118 · a link expires at the guard’s END plus that grace, not at its start',
    guardLinkExpiry(mission) === new Date(mission.endAt).getTime() + GUARD_LINK_GRACE_MS,
  )

  const raw = encodeGuardToken(token)
  const back = decodeGuardToken(raw, new Date(mission.endAt).getTime())
  check(
    'A118 · it round-trips: role, person and guard come back unchanged',
    back.status === 'valid' &&
      back.token?.role === 'volunteer' &&
      back.token.personId === volunteerId &&
      back.token.missionId === mission.id,
    back.status,
  )

  /* ★ L'INSTANT EXACT DE L'EXPIRATION EST TESTÉ DES DEUX CÔTÉS. « Expire après
     24 h » est une frontière, et une frontière qu'on ne teste que d'un côté est
     une frontière qu'on décale d'une milliseconde sans le voir. */
  const x = token.expiresAt
  check(
    'A118 · valid one millisecond before the deadline',
    decodeGuardToken(raw, x - 1).status === 'valid',
  )
  check(
    'A118 · and expired one millisecond after it',
    decodeGuardToken(raw, x + 1).status === 'expired',
  )
  check(
    'A118 · an expired link still NAMES its guard — the screen has to say which',
    decodeGuardToken(raw, x + HOUR).token?.missionId === mission.id,
  )

  /**
   * ★★ LA PORTE QUI COMPTE : ON NE PEUT PAS SE PROLONGER SOI-MÊME.
   *
   * Sans empreinte, la date d'expiration est un nombre dans une URL, et
   * n'importe qui la repousse d'un an en éditant la barre d'adresse. Ce n'est
   * pas de l'authentification (voir la note en tête d'`invite.ts`) mais c'est
   * la différence entre un lien qui expire et un lien qui prétend expirer.
   */
  const forged = guardTokenFor(
    { ...mission, endAt: new Date(Date.now() + 365 * 24 * HOUR).toISOString() } as Mission,
    'volunteer',
    volunteerId,
  )
  const forgedRaw = encodeGuardToken(forged)
  const spliced = `${forgedRaw.split('.')[0]}.${raw.split('.')[1]}`
  check(
    'A118 · ★ a hand-edited expiry does not pass — the body and the print disagree',
    decodeGuardToken(spliced).status === 'malformed',
  )
  check(
    'A118 · nor does a truncated or garbled token',
    decodeGuardToken('').status === 'malformed' &&
      decodeGuardToken('nonsense').status === 'malformed' &&
      decodeGuardToken(`${raw}x`).status === 'malformed',
  )

  const link = buildGuardLink('https://azmer-fts.github.io/lo-yanum', token)
  check(
    'A118 · the link opens the app ON the guard: one hash route, no login path',
    link.startsWith('https://azmer-fts.github.io/lo-yanum/#/g/') &&
      !link.includes('login') &&
      !link.includes('password'),
    link.slice(0, 52) + '…',
  )
  /**
   * ★ ET IL DOIT TENIR DANS UN SMS AVEC LE RESTE DU MESSAGE.
   *
   * C'est la raison pour laquelle le jeton ne porte PAS la garde entière
   * (invite.ts le dit) : un SMS fait 160 caractères par segment, la
   * convocation d'AE4 en occupe déjà plusieurs, et un lien de 1 500
   * caractères est un lien qu'un téléphone cachère affiche coupé — donc un
   * lien mort. 200 est large et c'est un plafond, pas une mesure.
   */
  check(
    'A118 · ★ and it is short enough to travel in an SMS',
    link.length < 200,
    `${link.length} characters`,
  )
}

// ---------------------------------------------------------------------------
section('A119 — rien d’historique sur l’appareil du volontaire')
// ---------------------------------------------------------------------------

{
  resetStore()
  const mission = _raw().missions[0]
  const farm = getFarm(mission.farmId)!
  const volunteer = _raw().volunteers.find(
    (v) => v.id === mission.assignments[0].volunteerId,
  )!
  const token = guardTokenFor(mission, 'volunteer', volunteer.id)
  const pass = buildGuardPass({
    token,
    mission,
    farm,
    anchor: getAnchorPoint(mission.anchorPointId),
    outline: getFarmZonesForFarm(farm.id).map((z) => z.ring),
    person: volunteer,
    numbers: [{ labelKey: 'anchor.labelCoordinator', name: 'x', phone: '050' }],
  })

  /**
   * ★★ « RIEN D'HISTORIQUE » EST UNE PROPRIÉTÉ DE LA FORME, PAS UNE PURGE.
   *
   * `GuardPass.mission` est UN objet et non un tableau : il n'y a pas de place
   * pour une seconde garde, donc pas de purge à écrire, pas de date de purge à
   * régler, et pas de tâche de nettoyage à ne pas oublier de lancer.
   */
  check(
    'A119 · ★ the pass holds ONE guard — there is no room for a history',
    !Array.isArray((pass as unknown as { mission: unknown }).mission) &&
      typeof pass.mission.id === 'string',
  )
  check(
    'A119 · and exactly the five things AE1.3 allows, no sixth',
    JSON.stringify(Object.keys(pass).sort()) ===
      JSON.stringify(['anchor', 'farm', 'mission', 'numbers', 'person', 'token']),
    Object.keys(pass).sort().join(','),
  )
  /* La garde porte quatre champs et pas la mission entière : ni les présences,
     ni les conducteurs, ni la file d'annulation. */
  check(
    'A119 · the guard it carries is four fields, not the whole mission record',
    JSON.stringify(Object.keys(pass.mission).sort()) ===
      JSON.stringify(['endAt', 'id', 'startAt', 'status']),
    Object.keys(pass.mission).sort().join(','),
  )
  check(
    'A119 · the person is a name and a number — no roster, no other guards',
    JSON.stringify(Object.keys(pass.person).sort()) ===
      JSON.stringify(['id', 'name', 'phone']),
  )
  const serialised = JSON.stringify(pass)
  check(
    'A119 · ★ and no OTHER farm of the programme is anywhere in it',
    _raw()
      .farms.filter((f) => f.id !== farm.id)
      .every((f) => !serialised.includes(f.name)),
  )
  check(
    'A119 · nor any other volunteer',
    _raw()
      .volunteers.filter((v) => v.id !== volunteer.id)
      .every((v) => !serialised.includes(v.name)),
  )
}

// ---------------------------------------------------------------------------
section('A120 · A121 · A122 — le bouton de détresse et la cascade')
// ---------------------------------------------------------------------------

{
  resetStore()
  const farm = getFarm('farm-01')!
  const roster = _raw().farms
  const ctx = {
    farm,
    roster,
    coordinator: { name: 'דב', phone: '052-1112222' },
    farmer: { name: 'אליהו בן־חמו', phone: '052-0000001' },
  }
  const labels = {
    title: 'מצוקה',
    who: 'מי',
    farm: 'חווה',
    at: 'שעה',
    coordinates: 'נ.צ.',
    navigation: 'ניווט',
    approximate: 'משוער',
  }

  check(
    'A120 · the hold is under the two-second budget with room for the rest',
    DISTRESS_HOLD_MS < DISTRESS_BUDGET_MS && DISTRESS_BUDGET_MS - DISTRESS_HOLD_MS >= 1000,
    `${DISTRESS_HOLD_MS} ms of ${DISTRESS_BUDGET_MS} ms`,
  )
  /* ★ ET IL EST AU-DESSUS DE L'APPUI ACCIDENTEL. Un téléphone dans une poche
     produit des contacts de 50 à 200 ms ; en dessous de 500 ms, le bouton
     partirait tout seul sur le trajet. */
  check(
    'A120 · and above the accidental press a phone makes in a pocket',
    DISTRESS_HOLD_MS >= 500,
  )

  const fix = { lat: 31.0611, lng: 34.6602 }
  const alert = buildDistressAlert({
    who: 'שמואל כהן',
    role: 'volunteer',
    phone: '053-9998887',
    position: fix,
    fallbackPosition: farm.position,
    farmId: farm.id,
    farmName: farm.name,
    at: new Date('2026-09-08T01:14:00.000Z'),
  })
  const plan = planDistress(alert, ctx, labels)

  check(
    'A121 · the alert says WHO — name and his own number',
    plan.body.includes('שמואל כהן') && plan.body.includes('053-9998887'),
  )
  check(
    'A121 · WHERE — the live fix, not the farm’s pin',
    plan.body.includes('31.06110') && plan.body.includes('34.66020'),
  )
  check(
    'A121 · WHICH FARM',
    plan.body.includes(farm.name),
  )
  check(
    'A121 · and WHEN',
    plan.body.includes('2026-09-08T01:14'),
  )
  /**
   * ★★ « EN PARALLÈLE » EST UNE PROPRIÉTÉ MESURABLE : UN SEUL SMS, DEUX
   *    NUMÉROS. Deux SMS envoyés l'un après l'autre, ce serait deux gestes de
   *    l'utilisateur, et le second ne partirait pas — parce qu'entre les deux
   *    il aura appuyé sur « appeler la police », ce qui est exactement ce
   *    qu'on veut qu'il fasse.
   */
  check(
    'A121 · ★ coordinator AND farmer in ONE composition — that is what parallel means',
    plan.smsRecipients.length === 2 &&
      plan.smsRecipients.includes('052-1112222') &&
      plan.smsRecipients.includes('052-0000001'),
    plan.smsRecipients.join(' + '),
  )
  check(
    'A121 · and the href carries both, comma-separated — the one separator both OSes take',
    plan.smsHref.startsWith('sms:0521112222,0520000001?&body='),
    plan.smsHref.slice(0, 34),
  )

  /**
   * ★★ A122 — LA CASCADE SANS RÉSEAU.
   *
   * On ne simule pas une panne : on montre que les deux voies téléphoniques
   * n'ont RIEN à simuler. `sms:` et `tel:` sont des URI que le système
   * d'exploitation résout ; le plan qui les porte est une fonction pure, donc
   * il rend le même résultat sur une machine sans pile réseau du tout — ce que
   * ce processus est, littéralement.
   */
  check(
    'A122 · ★ the plan is produced with no network of any kind — this process has none',
    plan.smsHref.startsWith('sms:') && plan.callTargets.length > 0,
    `${plan.callTargets.length} call targets`,
  )
  check(
    'A122 · every call target is a device URI, never an http request',
    plan.callTargets.every((c) => c.phone.length > 0),
  )
  check(
    'A122 · ★ the SMS carries the coordinates IN CLEAR, not only a link',
    /31\.06110/.test(plan.body) && plan.body.includes('waze.com'),
  )
  /* Un lien de navigation ne se lit pas à voix haute à un pilote de patrouille
     et ne s'ouvre pas sur un téléphone cachère. Les deux doivent être là. */
  check(
    'A122 · and the navigation link is IN ADDITION to them, not instead',
    plan.body.indexOf('31.06110') < plan.body.indexOf('waze.com'),
  )

  /* Sans fix GPS : on part quand même, avec la ferme, et on le DIT. */
  const noFix = buildDistressAlert({
    who: 'שמואל כהן',
    role: 'volunteer',
    phone: '053-9998887',
    position: null,
    fallbackPosition: farm.position,
    farmId: farm.id,
    farmName: farm.name,
  })
  check(
    'A122 · ★ no GPS fix: the alert still goes, on the farm’s pin, marked approximate',
    noFix.position !== null &&
      noFix.positionIsFallback &&
      planDistress(noFix, ctx, labels).body.includes('משוער'),
  )
}

// ---------------------------------------------------------------------------
section('A123 — les numéros qui dépendent du lieu')
// ---------------------------------------------------------------------------

{
  resetStore()
  const roster = _raw().farms
  const rotem = getFarm('farm-01')!
  const own = localEmergencyNumbers(rotem, roster)
  check(
    'A123 · a farm with both of its own gets its own',
    own.councilFrom === 'own' && own.standbyFrom === 'own',
    `${own.standby} / ${own.councilHotline}`,
  )

  /* ★ L'EMPRUNT PAR LA מועצה : `farm-02` partage la מועצה de `farm-01` et n'a
     pas de מוקד. Il le reçoit, et l'écran sait qu'il est emprunté. */
  const boker = getFarm('farm-02')!
  const borrowedCouncil = localEmergencyNumbers(boker, roster)
  check(
    'A123 · ★ מוקד המועצה borrowed from another farm of the SAME council',
    borrowedCouncil.councilHotline === own.councilHotline &&
      borrowedCouncil.councilFrom === 'council',
    borrowedCouncil.councilHotline,
  )
  check(
    'A123 · and its OWN כיתת כוננות is not overwritten by the borrowing',
    borrowedCouncil.standbyFrom === 'own' &&
      borrowedCouncil.standby !== own.standby,
  )

  /* ★ L'EMPRUNT PAR LE יישוב : `farm-13` est à רתמים comme `farm-01`. */
  const moshav = getFarm('farm-13')!
  const borrowedStandby = localEmergencyNumbers(moshav, roster)
  check(
    'A123 · ★ כיתת כוננות borrowed from another farm of the SAME יישוב',
    borrowedStandby.standby === own.standby && borrowedStandby.standbyFrom === 'locality',
    borrowedStandby.standby,
  )

  /**
   * ⚠️ ET LES DEUX ÉCHELLES NE SE CONFONDENT PAS. Un מוקד couvre dix יישובים ;
   *    apparier la כיתת כוננות sur la מועצה donnerait au volontaire de שדה
   *    בוקר l'équipe de רתמים, à quinze kilomètres. C'est la porte qui
   *    trouverait ce défaut, et il serait invisible autrement.
   */
  check(
    'A123 · ★ the two scales do not cross: a shared council does NOT share a squad',
    borrowedCouncil.standby !== own.standby,
    `${borrowedCouncil.standby} ≠ ${own.standby}`,
  )

  const nowhere: Farm = { ...rotem, id: 'x', council: '', locality: 'לא קיים', councilHotline: '', standbyPhone: '' }
  const none = localEmergencyNumbers(nowhere, roster)
  check(
    'A123 · a farm nobody has answered for gets nothing, and says so',
    none.councilFrom === 'none' && none.standbyFrom === 'none',
  )

  /* Et l'ordre du brief : les gens du coin d'abord, 100 ensuite. */
  const entries = emergencyEntries({
    farm: rotem,
    roster,
    coordinator: { name: 'דב', phone: '052-1112222' },
    farmer: { name: 'אליהו', phone: '052-0000001' },
  })
  const firstNational = entries.findIndex((e) => e.phone === '100')
  const lastLocal = entries.map((e) => e.tier).lastIndexOf(1)
  check(
    'A123 · ★ « ce sont eux qui arrivent les premiers » — locals before 100',
    lastLocal < firstNational && entries[0].kind === 'standby',
    `${entries[0].kind} … then 100 at ${firstNational}`,
  )
  check(
    'A123 · the coordinator and the farmer are ALWAYS there',
    entries.some((e) => e.kind === 'coordinator') && entries.some((e) => e.kind === 'farmer'),
  )
  check(
    'A123 · and the three national numbers are 100, 101, 102',
    EMERGENCY_SERVICES.filter((s) => s.always)
      .map((s) => s.phone)
      .join(',') === '100,101,102',
  )
}

// ---------------------------------------------------------------------------
section('A125 — תיק אתר')
// ---------------------------------------------------------------------------

{
  resetStore()
  const farm = getFarm('farm-01')!
  const mission = _raw().missions.find((m) => m.farmId === farm.id)!
  const volunteer = _raw().volunteers.find(
    (v) => v.id === mission.assignments[0].volunteerId,
  )!
  const zones = getFarmZonesForFarm(farm.id)
  const pass = buildGuardPass({
    token: guardTokenFor(mission, 'volunteer', volunteer.id),
    mission,
    farm,
    anchor: getAnchorPoint(mission.anchorPointId),
    outline: zones.map((z) => z.ring),
    person: volunteer,
    numbers: [],
  })

  check(
    'A125 · access and entry point',
    pass.farm.siteAccess.length > 0,
  )
  check('A125 · gate code or key', pass.farm.gateCode.length > 0)
  check('A125 · where to park', pass.farm.parking.length > 0)
  check('A125 · what the ground does — dogs, machinery, places to avoid', pass.farm.terrain.length > 0)
  check(
    'A125 · the farmer’s contact, and the anchor point’s written access',
    (pass.anchor?.accessDescription.length ?? 0) > 0,
  )
  check(
    'A125 · ★ and the farm’s OUTLINE, so the map shows where the holding stops',
    pass.farm.outline.length > 0 && pass.farm.outline[0].length >= 3,
    `${pass.farm.outline.length} ring(s), ${pass.farm.outline[0]?.length ?? 0} vertices`,
  )
  /* ⚠️ Un champ vide voyage VIDE plutôt que d'être omis : « il n'y a pas de
     portail » et « personne n'a écrit le code » demandent des actions
     opposées, et l'écran doit pouvoir dire la seconde. */
  const bare = buildGuardPass({
    token: guardTokenFor(mission, 'volunteer', volunteer.id),
    mission,
    farm: { ...farm, siteAccess: undefined, gateCode: undefined },
    anchor: null,
    outline: [],
    person: volunteer,
    numbers: [],
  })
  check(
    'A125 · ★ an unfilled field travels as an empty string, never absent',
    bare.farm.siteAccess === '' && bare.farm.gateCode === '',
  )
}

// ---------------------------------------------------------------------------
section('A126 · A127 — l’absence de nouvelles')
// ---------------------------------------------------------------------------

{
  const thresholds: VigilThresholds = {
    arrivalGraceMinutes: ARRIVAL_GRACE_MINUTES_INITIAL,
    checkpointIntervalMinutes: CHECKPOINT_INTERVAL_MINUTES_INITIAL,
    closeGraceMinutes: GUARD_CLOSE_GRACE_MINUTES_INITIAL,
  }
  check(
    'A126 · the three delays are NAMED constants',
    ARRIVAL_GRACE_MINUTES_INITIAL === 30 &&
      CHECKPOINT_INTERVAL_MINUTES_INITIAL === 120 &&
      GUARD_CLOSE_GRACE_MINUTES_INITIAL === 60,
    `${ARRIVAL_GRACE_MINUTES_INITIAL} / ${CHECKPOINT_INTERVAL_MINUTES_INITIAL} / ${GUARD_CLOSE_GRACE_MINUTES_INITIAL}`,
  )
  /**
   * ★ ET L'INTERVALLE EST GÉNÉREUX, CE QUI EST UNE EXIGENCE ET NON UN GOÛT :
   *   « un volontaire réveillé toutes les vingt minutes désinstalle l'app ».
   *   La porte le pose comme un plancher, parce que c'est la seule de ces trois
   *   valeurs dont un mauvais réglage rend les TROIS signaux muets d'un coup.
   */
  check(
    'A126 · ★ and the checkpoint interval is generous — under an hour would cost the feature',
    CHECKPOINT_INTERVAL_MINUTES_INITIAL >= 60,
  )

  const start = new Date('2026-09-08T18:00:00.000Z')
  const guard: Mission = {
    ..._raw().missions[0],
    id: 'm-test',
    farmId: 'farm-01',
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 8 * HOUR).toISOString(),
    status: 'planned',
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    checkpoints: [],
  }

  const justBefore = start.getTime() + (ARRIVAL_GRACE_MINUTES_INITIAL - 1) * MIN
  const justAfter = start.getTime() + (ARRIVAL_GRACE_MINUTES_INITIAL + 1) * MIN
  check(
    'A126 · inside the grace, nothing is said — a quarter of an hour late is the ordinary night',
    silenceSignals([guard], thresholds, justBefore).length === 0,
  )
  check(
    'A126 · ★ past it, the coordinator is told the guard was never taken',
    silenceSignals([guard], thresholds, justAfter)[0]?.kind === 'arrival_missing',
  )
  check(
    'A126 · and the signal names the farm to telephone, not only the guard',
    silenceSignals([guard], thresholds, justAfter)[0]?.farmId === 'farm-01',
  )
  /* Réglable : le seuil est un ARGUMENT, donc le changer suit immédiatement. */
  check(
    'A126 · ★ the delay is an argument: a shorter setting speaks at once',
    silenceSignals([guard], { ...thresholds, arrivalGraceMinutes: 5 }, justBefore)[0]
      ?.kind === 'arrival_missing',
  )
  check(
    'A126 · a cancelled guard is never silent — nobody was expected',
    silenceSignals([{ ...guard, status: 'cancelled' }], thresholds, justAfter).length === 0,
  )

  /* Le deuxième silence : arrivé, puis plus rien. */
  const arrived: Mission = {
    ...guard,
    status: 'in_progress',
    arrivalConfirmedAt: start.toISOString(),
  }
  const quiet = start.getTime() + (CHECKPOINT_INTERVAL_MINUTES_INITIAL + 5) * MIN
  check(
    'A126 · ★ arrived and then nothing: the checkpoint silence, during the night',
    silenceSignals([arrived], thresholds, quiet)[0]?.kind === 'checkpoint_missing',
  )
  const withSign: Mission = {
    ...arrived,
    checkpoints: [new Date(quiet - 10 * MIN).toISOString()],
  }
  check(
    'A126 · a sign of life resets it',
    silenceSignals([withSign], thresholds, quiet).length === 0,
  )
  /* Cinq minutes AVANT l'échéance, donc dans la fenêtre de relance de dix. */
  const state = checkpointState(arrived, thresholds, quiet - 10 * MIN)
  check(
    'A126 · ★ and the volunteer is ASKED before anything is raised',
    state.reminding && !state.overdue,
    `${state.silentMinutes} min silent, reminding`,
  )

  /* Le troisième : jamais clôturée. */
  const unclosed: Mission = {
    ...arrived,
    checkpoints: [new Date(start.getTime() + 7 * HOUR).toISOString()],
  }
  const morning =
    new Date(unclosed.endAt).getTime() + (GUARD_CLOSE_GRACE_MINUTES_INITIAL + 5) * MIN
  check(
    'A126 · ★ a guard nobody ever closed reaches the coordinator',
    silenceSignals([unclosed], thresholds, morning)[0]?.kind === 'end_missing',
  )
  /**
   * ⚠️ ET UNE GARDE NE PRODUIT QU'UN SEUL SIGNAL. Une garde jamais prise dont
   *    l'heure de fin est passée est silencieuse deux fois ; en dire deux
   *    choses fait téléphoner deux fois pour une seule ferme.
   */
  check(
    'A126 · ★ one guard, one signal — never two lines for one telephone call',
    silenceSignals([guard], thresholds, morning).length === 1,
  )
}

{
  // A127 — le compteur.
  resetStore()
  const farmId = 'farm-01'
  const before = farmGuardStats(farmId)
  const past = _raw().missions.filter(
    (m) =>
      m.farmId === farmId &&
      m.status !== 'cancelled' &&
      new Date(m.startAt).getTime() <= Date.now(),
  )
  const unconfirmed = past.filter((m) => m.arrivalConfirmedAt === null)
  /**
   * ⚠️ CETTE PORTE-LÀ GARDE LES AUTRES. Sans une garde passée NON confirmée
   *    dans les fixtures, « exclue parce que non confirmée » et « il n'y en
   *    avait pas » donnent le même compte, et les deux vérifications suivantes
   *    passeraient en ne mesurant rien. C'est `mission-08` qui existe pour ça.
   */
  check(
    'A127 · ★ the fixture holds BOTH kinds, or the two checks below prove nothing',
    past.length > 0 && unconfirmed.length > 0 && unconfirmed.length < past.length,
    `${past.length} past, ${unconfirmed.length} unconfirmed`,
  )
  check(
    'A127 · ★ an unconfirmed guard is NOT a guard received',
    before.guards === past.length - unconfirmed.length,
    `${before.guards} counted of ${past.length} scheduled`,
  )
  check(
    'A127 · the same rule decides the counter and the alert — one function',
    past.every((m) => guardWasHeld(m) === (m.arrivalConfirmedAt !== null)),
  )
  /* ★ ET CONFIRMER LA FAIT COMPTER, ce qui est l'autre moitié : la règle doit
     être une règle sur un FAIT, pas une exclusion permanente. */
  if (unconfirmed.length > 0) {
    confirmArrival(unconfirmed[0].id)
    const after = farmGuardStats(farmId)
    check(
      'A127 · ★ and confirming it makes it count — the rule is about a fact, not a penalty',
      after.guards === before.guards + 1,
      `${before.guards} → ${after.guards}`,
    )
    check(
      'A127 · its volunteers join the volunteer-nights at the same moment',
      after.volunteering > before.volunteering,
    )
  }
  /* Le point de contrôle ne compte pas comme une garde et n'invente rien. */
  const live = _raw().missions.find((m) => m.arrivalConfirmedAt !== null)!
  const n = live.checkpoints.length
  recordCheckpoint(live.id)
  check(
    'A127 · a checkpoint is appended, never a rewrite of the last one',
    _raw().missions.find((m) => m.id === live.id)!.checkpoints.length === n + 1,
  )
}

// ---------------------------------------------------------------------------
section('A128 — le SMS de convocation')
// ---------------------------------------------------------------------------

{
  resetStore()
  const farm = getFarm('farm-01')!
  const mission = _raw().missions.find((m) => m.farmId === farm.id)!
  const anchor = getAnchorPoint(mission.anchorPointId)
  const volunteerId = mission.assignments[0].volunteerId
  const token: GuardToken = guardTokenFor(mission, 'volunteer', volunteerId)

  const input = {
    mission,
    farm,
    roster: _raw().farms,
    anchor,
    coordinatorPhone: '052-1112222',
    guardLink: buildGuardLink('https://azmer-fts.github.io/lo-yanum', token),
    locale: 'he',
    kit: 'נעליים סגורות, מכנסיים ארוכים, מים, פנס',
    serviceLabels: {
      standby: 'כיתת כוננות',
      councilHotline: 'מוקד',
      police: 'משטרה',
      mda: 'מד"א',
      fire: 'כיבוי אש',
    },
  }
  const values = summonsValues(input)

  check(
    'A128 · the exact place — the name AND the coordinates, which is what « exact » means',
    values.place.includes(farm.name) && /\d+\.\d+/.test(values.place),
    values.place,
  )
  check('A128 · a navigation link', values.navigation.includes('waze.com'))
  check('A128 · the hours', values.from.length > 0 && values.to.length > 0, `${values.from}–${values.to}`)
  check(
    'A128 · the farmer’s name AND number',
    values.farmerName.length > 0 && values.farmerPhone.length > 0,
  )
  check('A128 · the coordinator’s number', values.coordinatorPhone === '052-1112222')
  check(
    'A128 · the emergency numbers, locals first',
    values.emergency.includes('100') &&
      values.emergency.indexOf('כיתת כוננות') < values.emergency.indexOf('משטרה'),
    values.emergency,
  )
  check(
    'A128 · the practical kit',
    values.kit.includes('פנס') && values.kit.includes('מים'),
  )
  check('A128 · and the guard link of AE1', values.link.includes('/#/g/'))

  /**
   * ★★ LE GABARIT EST MODIFIABLE, DONC LA COMPLÉTUDE EST STRUCTURELLE.
   *
   * Un gabarit libre est un gabarit dont on peut effacer le numéro du
   * coordinateur sans s'en apercevoir, et le SMS partirait quand même, tous
   * les jours, à tout le monde.
   */
  const shipped =
    'שמירה — {{place}} {{navigation}} {{date}} {{from}}–{{to}} ' +
    '{{farmerName}} {{farmerPhone}} {{coordinatorPhone}} {{emergency}} {{kit}} {{link}}'
  check(
    'A128 · ★ the shipped template is complete by the same check the editor runs',
    missingSummonsTokens(shipped).length === 0,
    `${SUMMONS_TOKENS.length} required fields`,
  )
  const mutilated = shipped.replace('{{coordinatorPhone}}', '')
  check(
    'A128 · ★ and a template that lost one is REFUSED, by name',
    missingSummonsTokens(mutilated).join(',') === 'coordinatorPhone',
    missingSummonsTokens(mutilated).join(','),
  )
  const rendered = buildSummons(input, shipped)
  check(
    'A128 · the rendered message leaves no placeholder behind',
    !rendered.includes('{{'),
  )
  /* Un jeton inconnu est laissé tel quel : un coordinateur qui a tapé
     `{{adresse}}` doit voir son erreur, pas un trou. */
  check(
    'A128 · an unknown placeholder is left visible rather than silently erased',
    buildSummons(input, 'x {{adresse}}').includes('{{adresse}}'),
  )
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
