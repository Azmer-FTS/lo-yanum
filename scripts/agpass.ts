import {
  CHALLENGE_BASE_DELAY_MS,
  CHALLENGE_FREE_ATTEMPTS,
  CHALLENGE_MAX_DELAY_MS,
  EMPTY_SIGN_DRAFT,
  RENEWAL_WINDOW_DAYS_DEFAULT,
  ReadOnlyViolation,
  addIncident,
  applyRemoteSignature,
  attachProvidedDocument,
  buildFarmerLink,
  buildFarmerLinkMessage,
  canSign,
  challengeDelayMs,
  challengeMatches,
  challengeStatus,
  challengeWaitMs,
  confirmArrival,
  dayKeyOf,
  dayKeyPlus,
  decodeFarmerToken,
  decodeGuardToken,
  documentChecklist,
  documentsCompleteButRightUnproven,
  encodeFarmerToken,
  expectedDocuments,
  farmerTokenFor,
  farmsToRenew,
  isReadOnly,
  landRightIssue,
  lastFourOf,
  missingDocumentCount,
  proposedFarmName,
  renewalAndLandRightAreDisjoint,
  renewalStatus,
  resetStore,
  setPresence,
  setReadOnly,
  setSession,
  signFormState,
} from '../src/core/index'
import { _raw } from '../src/core/store'
import type { Farm, SignDraft } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A140 · A142 · A144 … A149 — CE QU'UN NAVIGATEUR NE REND PAS PLUS VRAI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run agpass
 *
 *   A140  le verrou de « voir comme » : aucune mutation ne passe, et rien
 *         n'est laissé à moitié fait en mémoire.
 *   A142  les quatre derniers chiffres : accordé, refusé, mémorisé,
 *         temporisation croissante, JAMAIS de blocage définitif.
 *   A144  le formulaire, les trois parcours d'AG4.7, et le refus qui NOMME
 *         le champ manquant.
 *   A145  aucune surface demandée à l'agriculteur ; aucun OCR déclenché.
 *   A146  le nom de ferme proposé quand il est vide, et modifiable.
 *   A148  la file « לחידוש » : le compte est juste, et elle ne double PAS
 *         l'avertissement d'AA2bis.
 *   A149  les documents attendus déduits du סוג פעילות : un, un, ou deux.
 *   A152  chaque clé de traduction employée existe — un `t()` qui échoue rend
 *         sa propre clé, en silence, et c'est ainsi que le SMS de détresse
 *         portait « anchor.navigation » depuis AE.
 *   plus  le jeton de l'agriculteur : permanent, et il ne se confond pas avec
 *         celui d'une garde.
 *
 * ★ AUCUN NAVIGATEUR ICI, ET C'EST LA RAISON D'ÊTRE DU FICHIER — la même qu'en
 *   AF : ces familles sont des fonctions pures, les vérifier dans Chromium
 *   ajouterait quarante secondes de build et une chance de plus d'échouer pour
 *   une raison qui n'est pas le produit. Ce qui demande un écran est dans
 *   `bun run agui`.
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
console.log('  A140 · A142 · A144 … A149 — AG1 … AG6, SANS NAVIGATEUR')
console.log('  ======================================================')

// ---------------------------------------------------------------------------
section('1 — A140 · le verrou de « voir comme »')
// ---------------------------------------------------------------------------

/**
 * ★★ LA QUESTION EST POSÉE À L'ENVERS DE TOUTES LES AUTRES PORTES, ET C'EST
 *    CE QUI LA REND UTILE. `bun run persist` demande « cette mutation
 *    produit-elle bien un changement ? ». Celle-ci demande « après le verrou,
 *    en produit-elle AUCUN ? » — et une absence ne se prouve qu'en essayant.
 *
 * ⚠️ ET ELLE VÉRIFIE LES **DEUX** MOITIÉS DU CONTRAT, parce qu'une seule
 *    serait le pire des deux mondes. Refuser au `commit` sans restaurer
 *    laisserait la mutation faite en mémoire : l'écran mentirait jusqu'au
 *    rechargement, et la première écriture légitime après le retour au rôle de
 *    rekaz pousserait la mutation fantôme vers Postgres. La porte compare donc
 *    le magasin AVANT et APRÈS chaque tentative, octet par octet.
 */
resetStore()
{
  const before = JSON.stringify(_raw())
  setReadOnly(true)
  check('le verrou est posé', isReadOnly() === true)

  const mission = _raw().missions[0]
  const farm = _raw().farms[0]

  const attempts: Array<[string, () => void]> = [
    ['confirmArrival', () => confirmArrival(mission.id)],
    [
      'setPresence',
      () =>
        setPresence(
          mission.id,
          mission.assignments[0]?.volunteerId ?? 'x',
          'outbound',
          'self',
          'present',
        ),
    ],
    [
      'addIncident',
      () =>
        addIncident({
          farmId: farm.id,
          missionId: null,
          source: 'farmer',
          reporterId: null,
          reporterName: 'x',
          severity: 'urgent',
          description: 'x',
          position: null,
        }),
    ],
    [
      'applyRemoteSignature',
      () =>
        applyRemoteSignature(farm.id, {
          farmerName: 'x',
          farmerId: '1',
          farmerPhone: '05',
          farmName: 'x',
          signature: 'data:image/png;base64,AA',
          idPhoto: null,
          fileName: 'x.pdf',
        }),
    ],
    [
      'attachProvidedDocument',
      () =>
        attachProvidedDocument(farm.id, {
          id: 'crops',
          providedAt: new Date().toISOString(),
          fileName: 'x.pdf',
          file: 'data:application/pdf;base64,AA',
        }),
    ],
  ]

  for (const [name, fn] of attempts) {
    let threw: unknown = null
    try {
      fn()
    } catch (error) {
      threw = error
    }
    check(
      `A140 · ${name} est REFUSÉE`,
      threw instanceof ReadOnlyViolation,
      threw === null ? 'aucune erreur' : String((threw as Error).name),
    )
  }

  /**
   * ⚠️ LA SESSION EST EXCLUE DE LA COMPARAISON, ET C'EST VOULU. `setSession`
   *    ne passe pas par le verrou (voir sa note) : c'est « qui regarde », pas
   *    « ce qui est regardé », et c'est le geste de RETOUR qui doit marcher
   *    toujours. Comparer le magasin session comprise ferait échouer la porte
   *    sur la seule chose qui a le droit de bouger.
   */
  const strip = (json: string): string => {
    const d = JSON.parse(json) as Record<string, unknown>
    delete d.session
    return JSON.stringify(d)
  }
  check(
    'A140 · et le magasin est identique, octet pour octet',
    strip(JSON.stringify(_raw())) === strip(before),
    `${strip(JSON.stringify(_raw())).length} vs ${strip(before).length} octets`,
  )

  /* Et le retour au rôle de rekaz marche, verrou posé — c'est le seul geste
     qui n'a pas le droit d'être bloqué. */
  setSession({ role: 'coordinator', entityId: null })
  check(
    'A140 · le retour au rôle de rekaz passe malgré le verrou',
    _raw().session.role === 'coordinator',
  )

  setReadOnly(false)
  check('le verrou se lève', isReadOnly() === false)

  const after = drivenChange(() => confirmArrival(mission.id))
  check(
    'A140 · et une fois levé, une mutation écrit de nouveau',
    after === true,
  )
}

function drivenChange(fn: () => void): boolean {
  const before = JSON.stringify(_raw().missions)
  try {
    fn()
  } catch {
    return false
  }
  return JSON.stringify(_raw().missions) !== before
}

// ---------------------------------------------------------------------------
section('2 — A142 · les quatre derniers chiffres')
// ---------------------------------------------------------------------------

/**
 * ★ LES QUATRE ÉCRITURES DU MÊME NUMÉRO, PARCE QUE LES QUATRE SONT DANS LES
 *   FICHES. Voir `digitsOf` : c'est exactement pourquoi ce sont les DERNIERS
 *   chiffres qui sont demandés et pas les premiers.
 */
for (const [name, phone] of [
  ['local avec tirets', '052-0000049'],
  ['local avec espaces', '052 000 0049'],
  ['international avec tirets', '+972-52-0000049'],
  ['international collé', '972520000049'],
] as Array<[string, string]>) {
  check(`A142 · ${name} → 0049`, lastFourOf(phone) === '0049', String(lastFourOf(phone)))
}

check('A142 · une fiche sans numéro ne peut pas poser la question', lastFourOf('') === null)
check('A142 · trois chiffres ne suffisent pas', lastFourOf('123') === null)

check('A142 · la bonne réponse ouvre', challengeMatches('0049', '052-0000049') === true)
check('A142 · la mauvaise ferme', challengeMatches('0048', '052-0000049') === false)
check(
  'A142 · les tirets dans la saisie ne comptent pas',
  challengeMatches('00-49', '052-0000049') === true,
)

/**
 * ★★ LA TEMPORISATION : CROISSANTE, PUIS PLAFONNÉE, ET **JAMAIS** INFINIE.
 *
 * ⚠️ LA DERNIÈRE VÉRIFICATION EST CELLE QUI COMPTE, ET C'EST UNE PHRASE DU
 *    BRIEF : « pas de blocage définitif — un agriculteur bloqué un dimanche
 *    soir n'a personne à appeler ». Une progression sans plafond EST un
 *    blocage définitif : à la douzième tentative on demanderait deux heures.
 *    La porte pose donc la question à CENT échecs, un nombre qu'aucun humain
 *    n'atteint mais qu'une boucle atteint en une seconde.
 */
check(
  `A142 · ${CHALLENGE_FREE_ATTEMPTS} essais francs`,
  challengeDelayMs(0) === 0 && challengeDelayMs(CHALLENGE_FREE_ATTEMPTS - 1) === 0,
  `${challengeDelayMs(0)} / ${challengeDelayMs(CHALLENGE_FREE_ATTEMPTS - 1)}`,
)
check(
  'A142 · puis une attente qui apparaît',
  challengeDelayMs(CHALLENGE_FREE_ATTEMPTS) === CHALLENGE_BASE_DELAY_MS,
  `${challengeDelayMs(CHALLENGE_FREE_ATTEMPTS) / 1000} s`,
)
check(
  'A142 · et qui double',
  challengeDelayMs(CHALLENGE_FREE_ATTEMPTS + 1) === CHALLENGE_BASE_DELAY_MS * 2 &&
    challengeDelayMs(CHALLENGE_FREE_ATTEMPTS + 2) === CHALLENGE_BASE_DELAY_MS * 4,
  `${challengeDelayMs(CHALLENGE_FREE_ATTEMPTS + 1) / 1000} s → ${
    challengeDelayMs(CHALLENGE_FREE_ATTEMPTS + 2) / 1000
  } s`,
)
{
  const ladder = Array.from({ length: 100 }, (_, i) => challengeDelayMs(i))
  check(
    'A142 · elle ne dépasse JAMAIS le plafond, même à cent échecs',
    ladder.every((d) => d <= CHALLENGE_MAX_DELAY_MS),
    `max ${Math.max(...ladder) / 1000} s (plafond ${CHALLENGE_MAX_DELAY_MS / 1000} s)`,
  )
  check(
    'A142 · et elle est monotone — jamais une attente qui rétrécit',
    ladder.every((d, i) => i === 0 || d >= ladder[i - 1]),
  )
}
check(
  'A142 · une attente écoulée est une attente finie',
  challengeWaitMs(5, 0, CHALLENGE_MAX_DELAY_MS + 1) === 0,
)
check(
  "A142 · et recharger la page ne l'efface pas — c'est une soustraction de dates",
  challengeWaitMs(3, 1_000_000, 1_000_000) === challengeDelayMs(3),
)

/* AG2.2 — la mémoire, et sa péremption. */
const MEM = 90 * 86_400_000
check(
  'A142 · une saisie mémorisée ne repose pas la question',
  challengeStatus({
    phone: '052-0000049',
    unlockedAt: 1_000,
    failures: 0,
    lastFailureAt: 0,
    at: 1_000 + MEM - 1,
    memoryMs: MEM,
  }).state === 'open',
)
check(
  'A142 · mais une mémoire périmée la repose',
  challengeStatus({
    phone: '052-0000049',
    unlockedAt: 1_000,
    failures: 0,
    lastFailureAt: 0,
    at: 1_000 + MEM + 1,
    memoryMs: MEM,
  }).state === 'ask',
)
check(
  "A142 · et une fiche sans numéro n'a pas de porte, et le dit",
  (() => {
    const s = challengeStatus({
      phone: '',
      unlockedAt: null,
      failures: 0,
      lastFailureAt: 0,
      at: 0,
      memoryMs: MEM,
    })
    return s.state === 'open' && s.noNumber === true
  })(),
)

// ---------------------------------------------------------------------------
section('3 — le jeton de l’agriculteur : permanent, et distinct')
// ---------------------------------------------------------------------------

{
  const farm = _raw().farms[0]
  const contact = farm.contacts[0]
  const token = farmerTokenFor(farm, contact.id)
  const encoded = encodeFarmerToken(token)
  const read = decodeFarmerToken(encoded)
  check(
    'le jeton se relit',
    read.status === 'valid' &&
      read.token.contactId === contact.id &&
      read.token.farmId === farm.id,
  )

  /**
   * ⚠️ ET IL NE SE CONFOND PAS AVEC UN JETON DE GARDE. Les deux familles
   *    partagent l'alphabet et l'empreinte ; c'est le discriminant 'f' qui les
   *    sépare, et sans lui un jeton de garde abîmé pourrait se relire comme un
   *    jeton d'agriculteur et ouvrir la fiche d'une exploitation.
   */
  check(
    "un jeton d'agriculteur n'est pas lisible comme un jeton de garde",
    decodeGuardToken(encoded).status === 'malformed',
  )

  /* Et l'inverse : un jeton de garde n'ouvre pas un espace agriculteur. */
  const guard = _raw().missions[0]
  const guardLink = `${encoded.slice(0, 0)}`
  void guardLink
  check(
    "et une empreinte recollée ne passe pas",
    decodeFarmerToken(`${encoded.split('.')[0]}.deadbeef`).status === 'malformed',
  )
  void guard

  const link = buildFarmerLink('https://azmer-fts.github.io/lo-yanum', token)
  check(
    'le lien a la forme attendue',
    link.startsWith('https://azmer-fts.github.io/lo-yanum/#/f/'),
    link.slice(0, 60),
  )
  /* ★ AE1 posait un plafond de 200 caractères pour que le SMS survive à un
     téléphone cachère. Le lien permanent voyage dans le même SMS. */
  check('et il tient dans un SMS', link.length <= 200, `${link.length} caractères`)

  const body = buildFarmerLinkMessage({
    farmerName: 'יוסי',
    farmName: 'החווה של יוסי',
    until: '2026-11-01',
    link,
    coordinatorName: 'דובי',
    coordinatorPhone: '052-0000049',
    labels: {
      greeting: 'שלום',
      intro: 'זהו הקישור שלך',
      renewal: 'תוקף ההסכם מסתיים ב־{{date}}',
      ask: 'ארבע ספרות',
      signature: 'בברכה,',
    },
  })
  check('le message porte le lien', body.includes(link))
  check('et la date du renouvellement quand il y en a une', body.includes('2026-11-01'))
  check(
    'le lien est sur sa propre ligne, en fin de message',
    body.split('\n').includes(link),
  )
  const first = buildFarmerLinkMessage({
    farmerName: 'יוסי',
    farmName: '',
    until: null,
    link,
    coordinatorName: 'דובי',
    coordinatorPhone: '052-0000049',
    labels: {
      greeting: 'שלום',
      intro: 'זהו הקישור שלך',
      renewal: 'תוקף ההסכם מסתיים ב־{{date}}',
      ask: 'ארבע ספרות',
      signature: 'בברכה,',
    },
  })
  check(
    "une première invitation ne parle pas d'échéance",
    !first.includes('מסתיים'),
  )
}

// ---------------------------------------------------------------------------
section('4 — A144 · A145 · A146 · le formulaire de signature')
// ---------------------------------------------------------------------------

/**
 * ★★ LES TROIS PARCOURS D'AG4.7, POSÉS COMME TROIS FICHES ET NON COMME TROIS
 *    SCÉNARIOS D'ÉCRAN. Ce qui décide de ce qui est demandé est
 *    `signFormState`, une fonction pure de la fiche : la vérifier ici la
 *    vérifie pour les trois viewports à la fois, et `bun run agui` n'a plus
 *    qu'à confirmer que l'écran obéit.
 */
function farmWith(patch: Partial<Farm>): Farm {
  return { ..._raw().farms[0], agreements: [], ...patch }
}

const NO_PHOTO = { requireIdPhoto: false }

{
  /* Parcours 1 — tout saisi par le PO : vérifier, cocher, signer. */
  const farm = farmWith({
    farmerName: 'יוסי כהן',
    farmerId: '012345678',
    farmerPhone: '052-0000077',
    farmName: 'משק כהן',
  })
  const state = signFormState(farm, EMPTY_SIGN_DRAFT, NO_PHOTO)
  check('A144 · parcours 1 — aucun champ redemandé', state.asked.length === 0,
    state.asked.join(', '))
  check('A144 · parcours 1 — rien ne manque', state.missing.length === 0)
  /* ★★ AH6.3 — LA CASE A DISPARU, ET LA PORTE CHANGE DE SENS AVEC ELLE. Le PO
     a tranché : « pas de case à cocher si elle fait doublon avec l'acte de
     signer ». Ce qui était « bloqué tant qu'elle n'est pas cochée » devient
     donc « rien ne bloque » — et c'est cela qu'il faut vérifier, sinon la
     porte garderait une exigence que le produit n'a plus. */
  check(
    'A144/AH6.3 · parcours 1 — plus aucune case à cocher : on peut signer',
    state.blocked === null && canSign(state) === true,
  )
}

{
  /* Parcours 2 — nom et téléphone saisis, ת״ז manquante : UN seul champ. */
  const farm = farmWith({
    farmerName: 'יוסי כהן',
    farmerId: '',
    farmerPhone: '052-0000077',
    farmName: 'משק כהן',
  })
  const state = signFormState(farm, EMPTY_SIGN_DRAFT, NO_PHOTO)
  check(
    'A144 · parcours 2 — un seul champ est demandé',
    state.asked.length === 1 && state.asked[0] === 'farmerId',
    state.asked.join(', '),
  )
  check(
    'A144 · parcours 2 — et le refus NOMME ce champ',
    state.blocked?.kind === 'fields' &&
      state.blocked.fields.length === 1 &&
      state.blocked.fields[0] === 'farmerId',
  )
  const filled = signFormState(
    farm,
    { ...EMPTY_SIGN_DRAFT, farmerId: '012345678' },
    NO_PHOTO,
  )
  check('A144 · parcours 2 — rempli, on peut signer', canSign(filled) === true)
  check(
    'A144 · parcours 2 — et la valeur de la fiche n’est pas écrasée par la saisie',
    filled.values.farmerName === 'יוסי כהן',
  )
}

{
  /* Parcours 3 — téléphone seul : nom, ת״ז, ferme proposée, puis signature. */
  const farm = farmWith({
    farmerName: '',
    farmerId: '',
    farmerPhone: '052-0000077',
    farmName: '',
  })
  const state = signFormState(farm, EMPTY_SIGN_DRAFT, NO_PHOTO)
  check(
    'A144 · parcours 3 — trois champs demandés',
    state.asked.length === 3 &&
      state.asked.includes('farmerName') &&
      state.asked.includes('farmerId') &&
      state.asked.includes('farmName'),
    state.asked.join(', '),
  )
  check(
    'A144 · parcours 3 — deux obligatoires manquent, tous deux nommés',
    state.blocked?.kind === 'fields' && state.blocked.fields.length === 2,
    state.blocked?.kind === 'fields' ? state.blocked.fields.join(', ') : '',
  )

  /* A146 — le nom de ferme proposé, et modifiable. */
  const proposal = proposedFarmName('יוסי כהן', 'החווה של {{first}}')
  check(
    'A146 · le nom de ferme est proposé depuis le PRÉNOM',
    proposal === 'החווה של יוסי',
    proposal,
  )
  check(
    "A146 · et rien n'est proposé tant que le nom est vide",
    proposedFarmName('', 'החווה של {{first}}') === '',
  )
  const draft: SignDraft = {
    ...EMPTY_SIGN_DRAFT,
    farmerName: 'יוסי כהן',
    farmerId: '012345678',
    farmName: 'משק כהן',

  }
  const edited = signFormState(farm, draft, NO_PHOTO)
  check(
    'A146 · la proposition est modifiable — la saisie gagne',
    edited.values.farmName === 'משק כהן',
    edited.values.farmName,
  )
  check('A144 · parcours 3 — et on peut signer', canSign(edited) === true)

  /* A147 — la photo facultative par défaut, obligatoire par réglage. */
  check(
    'A147 · sans le réglage, la photo ne bloque pas',
    canSign(signFormState(farm, draft, { requireIdPhoto: false })) === true,
  )
  const withSetting = signFormState(farm, draft, { requireIdPhoto: true })
  check(
    'A147 · avec le réglage, elle bloque, et le refus le dit',
    withSetting.blocked?.kind === 'photo' && !canSign(withSetting),
  )
  check(
    'A147 · et une photo fournie débloque',
    canSign(
      signFormState(farm, { ...draft, idPhoto: 'data:image/jpeg;base64,AA' }, {
        requireIdPhoto: true,
      }),
    ) === true,
  )
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ A145 — AUCUNE SURFACE, AUCUN OCR. LA PORTE LIT LE CODE PLUTÔT QUE DE
 *    FAIRE CONFIANCE AU COMMENTAIRE QUI LE DIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ C'EST UNE VÉRIFICATION SUR LE FICHIER SOURCE, ET C'EST ASSUMÉ. Les deux
 *    interdictions d'AG4.2 et d'AG4.3 sont des ABSENCES : il n'existe aucune
 *    valeur à interroger qui dise « ce formulaire ne demande pas de dounams ».
 *    La seule question qu'on peut poser est « le mot apparaît-il là où il
 *    produirait un champ ? », et c'est la question que le PO poserait en
 *    relisant. `bun run agui` pose la même question à l'ÉCRAN RENDU, en
 *    comptant les champs de saisie — les deux ensemble couvrent le cas où
 *    quelqu'un ajouterait le champ sous un autre nom.
 */
{
  const source = await Bun.file('src/ui/screens/farmer/FarmerSignScreen.tsx').text()
  /**
   * ⚠️★★ LES COMMENTAIRES SONT RETIRÉS EN BLOC, ET LA PREMIÈRE VERSION DE CETTE
   *    SONDE A ÉCHOUÉ SUR ELLE-MÊME — ce qui était instructif. Elle filtrait
   *    ligne à ligne les lignes commençant par `*` ou `//`, et le fichier
   *    contient un commentaire de bloc qui dit littéralement « pas d'OCR, pas
   *    de MRZ » : la ligne d'ouverture commence par `/*` et la suivante par du
   *    texte, donc aucune des deux n'était filtrée. La porte accusait le code
   *    de faire exactement ce que le commentaire promettait de ne pas faire.
   *
   *    C'est un piège général et pas un accident : une porte qui cherche
   *    l'ABSENCE d'un mot ne doit jamais lire la prose qui explique pourquoi ce
   *    mot est absent, sinon elle interdit d'écrire la raison — et une
   *    interdiction dont on ne peut pas écrire la raison est une interdiction
   *    que le prochain lecteur enfreindra de bonne foi.
   */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n')

  const areaWords = ['dunam', 'Dunam', 'דונם', 'farmDunams', 'grazingDunams', 'guardedDunams']
  const foundAreas = areaWords.filter((w) => code.includes(w))
  check(
    'A145 · aucune surface n’est demandée à l’agriculteur',
    foundAreas.length === 0,
    foundAreas.join(', '),
  )

  const ocrWords = ['ocr', 'OCR', 'tesseract', 'Tesseract', 'recognize', 'mrz', 'MRZ']
  const foundOcr = ocrWords.filter((w) => code.includes(w))
  check(
    'A145 · et aucune lecture automatique de la carte',
    foundOcr.length === 0,
    foundOcr.join(', '),
  )

  const deps = JSON.parse(await Bun.file('package.json').text()) as {
    dependencies: Record<string, string>
  }
  const ocrDeps = Object.keys(deps.dependencies).filter((d) =>
    /tesseract|ocr|vision|scandit/i.test(d),
  )
  check(
    'A145 · et aucune bibliothèque de reconnaissance dans le paquet',
    ocrDeps.length === 0,
    ocrDeps.join(', '),
  )
}

// ---------------------------------------------------------------------------
section('5 — A149 · les documents attendus se déduisent du סוג פעילות')
// ---------------------------------------------------------------------------

check('A149 · cultures seules → un document', expectedDocuments('agriculture').length === 1,
  expectedDocuments('agriculture').join(', '))
check('A149 · pâturage seul → un document', expectedDocuments('livestock').length === 1,
  expectedDocuments('livestock').join(', '))
check('A149 · les deux → deux documents', expectedDocuments('mixed').length === 2,
  expectedDocuments('mixed').join(', '))
check(
  'A149 · et ce ne sont pas les mêmes documents',
  expectedDocuments('agriculture')[0] !== expectedDocuments('livestock')[0],
)

{
  const farm = farmWith({ type: 'mixed', providedDocuments: undefined })
  check('A149 · une fiche neuve en manque deux', missingDocumentCount(farm) === 2)
  const withOne = farmWith({
    type: 'mixed',
    providedDocuments: [
      {
        id: 'crops',
        providedAt: '2026-09-01T00:00:00.000Z',
        fileName: 'x.pdf',
        file: 'data:application/pdf;base64,AA',
      },
    ],
  })
  check('A149 · un document fourni, un qui manque', missingDocumentCount(withOne) === 1)
  const lines = documentChecklist(withOne)
  check(
    'A149 · et la liste dit lequel',
    lines.length === 2 &&
      lines.find((l) => l.id === 'crops')?.provided !== null &&
      lines.find((l) => l.id === 'grazing')?.provided === null,
  )

  /* ★★ AG6.4 — le dossier complet ne répond pas à la question d'AA2bis. */
  const complete = farmWith({
    type: 'livestock',
    landAgreement: 'farmer_declaration',
    landAgreementUntil: '2027-01-01',
    providedDocuments: [
      {
        id: 'grazing',
        providedAt: '2026-09-01T00:00:00.000Z',
        fileName: 'x.pdf',
        file: 'data:application/pdf;base64,AA',
      },
    ],
  })
  check(
    'A149 · dossier complet, droit sur la terre NON établi — les deux sont dits',
    missingDocumentCount(complete) === 0 &&
      documentsCompleteButRightUnproven(complete, '2026-09-09') === true,
    landRightIssue(complete, '2026-09-09'),
  )
}

// ---------------------------------------------------------------------------
section('6 — A148 · la file « לחידוש » et son voisinage avec AA2bis')
// ---------------------------------------------------------------------------

{
  const today = new Date('2026-09-09T00:00:00.000Z')
  const todayKey = dayKeyOf(today)

  const mk = (id: string, until: string | null): Farm =>
    ({ ..._raw().farms[0], id, landAgreementUntil: until }) as Farm

  const farms: Farm[] = [
    mk('f-none', null),
    mk('f-far', dayKeyPlus(today, 200)),
    mk('f-edge-in', dayKeyPlus(today, RENEWAL_WINDOW_DAYS_DEFAULT)),
    mk('f-edge-out', dayKeyPlus(today, RENEWAL_WINDOW_DAYS_DEFAULT + 1)),
    mk('f-today', todayKey),
    mk('f-past', dayKeyPlus(today, -1)),
  ]

  const due = farmsToRenew(farms, todayKey)
  check(
    'A148 · le compte est juste',
    due.length === 2,
    due.map((f) => f.id).join(', '),
  )
  check(
    'A148 · la plus proche échéance en tête',
    due[0].id === 'f-today' && due[1].id === 'f-edge-in',
    due.map((f) => f.id).join(' → '),
  )

  /**
   * ⚠️ LES DEUX BORNES SONT VÉRIFIÉES SÉPARÉMENT, ET C'EST LÀ QUE LES BOGUES
   *    VIVENT. Le jour même est DEDANS (une échéance aujourd'hui appelle une
   *    signature aujourd'hui) et le jour d'après la fenêtre est DEHORS. Un
   *    `<` au lieu d'un `<=` déplacerait la file d'une fiche sans que rien ne
   *    le dise.
   */
  check(
    "A148 · le jour même est dans la file",
    renewalStatus(mk('x', todayKey), todayKey).state === 'due',
  )
  check(
    'A148 · le jour d’après la fenêtre ne l’est pas',
    renewalStatus(mk('x', dayKeyPlus(today, RENEWAL_WINDOW_DAYS_DEFAULT + 1)), todayKey)
      .state === 'later',
  )
  check(
    "A148 · et une échéance passée n'est pas « à renouveler », elle est expirée",
    renewalStatus(mk('x', dayKeyPlus(today, -1)), todayKey).state === 'expired',
  )

  /**
   * ★★ AG5.4 — LES DEUX MÉCANISMES SE COMPLÈTENT AU LIEU DE SE DOUBLER, ET LA
   *    PORTE LE VÉRIFIE SUR TOUTES LES FICHES PLUTÔT QUE DE LE RAISONNER.
   */
  const dated = farms.map((f) => ({
    ...f,
    landAgreement: 'lease',
  })) as Farm[]
  check(
    'A148 · aucune fiche ne peut être « לחידוש » ET « expiré » à la fois',
    renewalAndLandRightAreDisjoint(dated, todayKey) === true,
  )
  check(
    'A148 · et la frontière est bien le jour même',
    landRightIssue(mk('x', todayKey) as Farm & { landAgreement: string }, todayKey) !==
      'expired',
  )

  /**
   * Une fenêtre réglée plus large prend plus de fiches — c'est ce que
   * « réglable » veut dire, et une constante figée le rendrait faux.
   *
   * ⚠️ LE NOMBRE ATTENDU EST 4 ET NON 3, ET MA PREMIÈRE VERSION DISAIT 3.
   *    À 250 jours la fenêtre prend `f-today` (0), `f-edge-in` (60),
   *    `f-edge-out` (61) et `f-far` (200) — quatre. `f-none` n'a pas de date
   *    et `f-past` est expirée. Compté à la main plutôt que déduit d'un
   *    « une de plus », ce qui est l'erreur que ce commentaire remplace.
   */
  const wide = farmsToRenew(farms, todayKey, 250)
  check(
    'A148 · la fenêtre est réellement réglable',
    wide.length === 4,
    wide.map((f) => f.id).join(', '),
  )
}

// ---------------------------------------------------------------------------
section('7 — chaque clé de traduction employée existe vraiment')
// ---------------------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ A152 — UN `t()` QUI ÉCHOUE REND SA PROPRE CLÉ, ET C'EST PARFAITEMENT
 *    SILENCIEUX.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CETTE PORTE EXISTE PARCE QU'ELLE A TROUVÉ QUELQUE CHOSE LA PREMIÈRE FOIS
 *    QU'ELLE A ÉTÉ ÉCRITE, ET DANS LE PIRE ENDROIT POSSIBLE. `EmergencyScreen`
 *    composait le SMS de détresse avec `t('anchor.navigation')` — une clé qui
 *    n'existe dans aucune traduction. i18next rend alors la CLÉ, donc l'alerte
 *    envoyée à trois heures du matin portait la ligne littérale
 *    « anchor.navigation: https://waze.com/… » au lieu de « ניווט ». Rien ne
 *    plante, rien ne s'affiche en rouge, et personne ne le voit avant d'avoir
 *    besoin du message. Le défaut datait d'AE2a et trois passes l'ont relu.
 *
 * ★ CE QUI EST CHERCHÉ EST ÉTROIT EXPRÈS : uniquement `t('quelque.chose')`
 *   avec un point, uniquement sous `src/`. Sans le point la sonde ramasse
 *   `document.createElement('div')` et une trentaine d'autres appels d'une
 *   lettre qui n'ont rien à voir — et une porte qui crie à tort est une porte
 *   qu'on désactive. Les clés composées à l'exécution (`t(\`roles.${r}\`)`) ne
 *   sont pas couvertes : leur préfixe est vérifié par les écrans qui les
 *   rendent, et une porte ne doit pas prétendre couvrir ce qu'elle ne voit pas.
 */
{
  const he = (await Bun.file('src/locales/he.json').json()) as Record<string, unknown>
  const has = (key: string): boolean => {
    let cur: unknown = he
    for (const part of key.split('.')) {
      if (typeof cur !== 'object' || cur === null) return false
      cur = (cur as Record<string, unknown>)[part]
      if (cur === undefined) return false
    }
    return true
  }

  const files: string[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await Array.fromAsync(new Bun.Glob('**/*.{ts,tsx}').scan(dir))) {
      files.push(`${dir}/${entry}`)
    }
  }
  await walk('src')

  const missing: string[] = []
  for (const file of files) {
    const text = await Bun.file(file).text()
    for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'/g)) {
      if (!has(m[1])) missing.push(`${m[1]} ← ${file}`)
    }
  }
  check(
    'A152 · aucune clé de traduction employée n’est absente du fichier de langue',
    missing.length === 0,
    missing.slice(0, 4).join(' | ') || `${files.length} fichiers`,
  )
}

// ===========================================================================

console.log('')
if (failed > 0) {
  console.log(`  ${failed} of ${passed + failed} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${passed} checks passed.`)
