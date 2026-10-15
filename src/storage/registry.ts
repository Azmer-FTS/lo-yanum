/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BJ (2026-10-15) — LE REGISTRE DES RÉGLAGES. LA SEULE SOURCE DE VÉRITÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Je suis dans mon bureau, je sors avec mon téléphone, je n'ai pas mon
 *     ordinateur, et j'ai mes données à jour sans avoir à remanipuler quoi que
 *     ce soit. »                                                    — le PO
 *
 * Trois pannes ont eu la même cause — un réglage rangé sur l'APPAREIL au lieu
 * du COMPTE, qui fait diverger l'iPad et l'ordinateur sans que personne ne le
 * voie : le thème (BC), les épingles de la carte (AU1), les couches de la
 * légende (BI). Chaque fois un seul réglage avait été corrigé. Ce fichier
 * traite le défaut de conception :
 *
 *   ★ PAR DÉFAUT, UN RÉGLAGE SUIT LE COMPTE (`scope: 'account'`).
 *   ★ RESTER SUR L'APPAREIL EST L'EXCEPTION, ET CHAQUE EXCEPTION DIT POURQUOI
 *     (`reason` + `why`). Les quatre raisons admises par le PO :
 *       · `draft`      — un brouillon de tracé en cours (le geste de CET écran) ;
 *       · `offline`    — une file d'attente hors ligne non encore envoyée
 *                        (et la copie hors ligne qui la sert) ;
 *       · `auth`       — la session d'authentification ;
 *       · `diagnostic` — un drapeau de développement ou de diagnostic.
 *     Et une cinquième, que le PO tranchera (`machine`) : ce qui décrit la
 *     machine elle-même (sa position GPS, le build qu'elle exécute, un calcul
 *     fait sur SA carte téléchargée). Chacune est listée « à arbitrer ».
 *   ★ AUCUNE ÉCRITURE DANS `localStorage`, `sessionStorage` OU IndexedDB HORS
 *     DE `src/storage/`. `bun run bjguard` le vérifie sur tout `src/`, et
 *     vérifie que chaque clé employée est déclarée ICI.
 *
 * ⚠️ CE FICHIER EST PUR (aucun accès au navigateur) : les portes l'importent
 *    sans navigateur, et `docs/bj/reglages.md` en est tiré.
 */

export type SettingScope = 'account' | 'device'
export type DeviceReason = 'draft' | 'offline' | 'auth' | 'diagnostic' | 'machine'
/** Où l'appareil range la valeur (sa copie locale, pour un réglage de compte). */
export type SettingArea = 'local' | 'idb' | 'cache'

export interface SettingDef {
  /** La clé exacte — ou, avec `family`, le préfixe d'une famille (`…:<ferme>`). */
  key: string
  family?: boolean
  area: SettingArea
  scope: SettingScope
  /** Pour `scope: 'device'` : laquelle des raisons admises. */
  reason?: DeviceReason
  /** Pour `scope: 'device'` : la justification, en une phrase. */
  why?: string
  /** ★ « À ARBITRER » : la recommandation, pour que le PO tranche. */
  arbitrate?: string
  /** Ce que la valeur contient, et son type. */
  label: string
  /** Le défaut quand la valeur est absente, illisible ou inconnue — toujours celui qui MONTRE. */
  fallbackNote: string
  /**
   * La valeur brute rangée quand la valeur lue est illisible : `null` = aucune
   * (le module applique alors `fallbackNote`).
   */
  fallback: string | null
  /** Le validateur : la valeur brute est-elle lisible ? Sinon → `fallback`. */
  validate: (raw: string) => boolean
  /** Le module propriétaire. */
  owner: string
  /** Avant BJ : la clé voyageait-elle ? (`partial` = « choisie seulement », AY1.3/BI) */
  syncedBefore: 'yes' | 'no' | 'partial' | 'n/a'
  /** Un commentaire ou un texte qui MENTAIT sur ce point avant BJ. */
  lie?: string
}

// ---------------------------------------------------------------------------
// Les validateurs (purs)
// ---------------------------------------------------------------------------

const any = (): boolean => true
const nonEmpty = (raw: string): boolean => raw.trim().length > 0
const oneOf =
  (...values: string[]) =>
  (raw: string): boolean =>
    values.includes(raw)
const num =
  (min: number, max: number) =>
  (raw: string): boolean => {
    if (raw.trim() === '') return false
    const n = Number(raw)
    return Number.isFinite(n) && n >= min && n <= max
  }
function parse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const jsonObject = (raw: string): boolean => isObject(parse(raw))
const jsonArray = (raw: string): boolean => Array.isArray(parse(raw))
const jsonNumber = (raw: string): boolean => typeof parse(raw) === 'number'
const sortState = (raw: string): boolean => {
  const v = parse(raw)
  return isObject(v) && typeof v.key === 'string' && (v.dir === 'asc' || v.dir === 'desc')
}
const themeChoice = oneOf('light', 'dark', 'system')
const bit = oneOf('1', '0')
const mapMode = oneOf('hidden', 'split', 'full')

/** Les validateurs, exportés pour les portes (`bjpass` A512). */
export const VALIDATORS = { any, nonEmpty, oneOf, num, jsonObject, jsonArray, jsonNumber, sortState, themeChoice, bit, mapMode }

// ---------------------------------------------------------------------------
// LE REGISTRE
// ---------------------------------------------------------------------------

const ACCOUNT = { area: 'local', scope: 'account' } as const

export const SETTINGS: readonly SettingDef[] = [
  // ══════════ LE PROGRAMME — voyageaient déjà (AH11.2 · AS4) ══════════
  { ...ACCOUNT, key: 'lo-yanum:target', label: 'objectif du programme (JSON objet : fermes, nuits, seuils)', fallback: null, fallbackNote: 'objectif livré', validate: jsonObject, owner: 'src/ui/settings/target.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:coverage', label: 'seuil des fermes oubliées (JSON objet)', fallback: null, fallbackNote: 'seuil livré', validate: jsonObject, owner: 'src/ui/settings/coverage.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:coverage-map', label: 'carte de couverture : borne km/min, nuit, familles visibles (JSON objet)', fallback: null, fallbackNote: 'borne livrée, toutes les familles du préréglage « préparer » visibles', validate: jsonObject, owner: 'src/ui/screens/coordinator/CoverageScreen.tsx', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:vigil', label: 'signes de vie : minutes d’arrivée et de point de contrôle (JSON objet)', fallback: null, fallbackNote: 'délais livrés', validate: jsonObject, owner: 'src/ui/settings/vigil.ts', syncedBefore: 'yes', lie: 'he.json settings.vigil.intro disait « הערכים נשמרים במכשיר הזה » alors que la clé voyageait depuis AS4' },
  { ...ACCOUNT, key: 'lo-yanum:renewal-window', label: 'fenêtre de renouvellement, en jours (nombre)', fallback: null, fallbackNote: 'fenêtre livrée', validate: num(1, 3650), owner: 'src/ui/settings/renewal.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:area-gap', label: 'seuil d’écart de surface (JSON objet)', fallback: null, fallbackNote: '10 %', validate: jsonObject, owner: 'src/ui/settings/areaGap.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:require-id-photo', label: 'photo de ת״ז obligatoire (« 1 » ou absente)', fallback: null, fallbackNote: 'facultative', validate: oneOf('1'), owner: 'src/ui/settings/renewal.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:summons-template', label: 'gabarit de convocation (texte)', fallback: null, fallbackNote: 'gabarit livré', validate: any, owner: 'src/ui/settings/summons.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:agreement-doc-template', label: 'gabarit du contrat (texte)', fallback: null, fallbackNote: 'gabarit livré', validate: any, owner: 'src/ui/settings/agreementDoc.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:agreement-doc-logo', label: 'logo du contrat (JSON objet, image en data: URI, ≈ 200 ko)', fallback: null, fallbackNote: 'aucun logo', validate: jsonObject, owner: 'src/ui/settings/agreementDoc.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:region-rings', label: 'régions redessinées (JSON objet : région → anneau)', fallback: null, fallbackNote: 'régions livrées', validate: jsonObject, owner: 'src/ui/settings/regionEdits.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:coordinator', label: 'carte du coordinateur : nom, téléphone, rôle (JSON objet)', fallback: null, fallbackNote: 'carte livrée', validate: jsonObject, owner: 'src/core/profile.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:origin', label: 'point de départ des tournées (JSON objet)', fallback: null, fallbackNote: 'aucun point', validate: jsonObject, owner: 'src/ui/settings/origin.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:free-routes', label: 'itinéraires libres enregistrés (JSON tableau)', fallback: null, fallbackNote: 'aucun', validate: jsonArray, owner: 'src/ui/settings/freeRoutes.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:route-margin', label: 'marge des durées de roulage, en % (nombre)', fallback: null, fallbackNote: 'marge livrée', validate: num(0, 100), owner: 'src/ui/settings/routeMargin.ts', syncedBefore: 'yes' },
  { ...ACCOUNT, key: 'lo-yanum:institution-doc', label: 'site, mail, téléphone du pied du document d’institution (JSON objet)', fallback: null, fallbackNote: 'site et mail publics d’ארצנו, téléphone vide', validate: jsonObject, owner: 'src/ui/institutions/InstitutionDocBlock.tsx', syncedBefore: 'yes' },

  // ══════════ L'AFFICHAGE — voyageaient « choisis seulement » ══════════
  { ...ACCOUNT, key: 'lo-yanum:theme:coordinator', label: 'thème du coordinateur : light | dark | system', fallback: null, fallbackNote: '« selon l’appareil » (system)', validate: themeChoice, owner: 'src/ui/theme.tsx', syncedBefore: 'partial' },
  { ...ACCOUNT, key: 'lo-yanum:map-layers', label: 'couches de la carte (JSON objet `__v: 2`, couche → booléen)', fallback: null, fallbackNote: 'toutes les formes et fermes MONTRÉES', validate: jsonObject, owner: 'src/ui/components/mapLayers.ts', syncedBefore: 'partial', lie: 'MapLegend.tsx (BD 4) disait « synchronisé avec le compte » alors que la clé était dans LOCAL_ONLY_KEYS — relevé et corrigé en BI' },

  // ══════════ NOUVEAUX SUR LE COMPTE (BJ) — restaient sur l'appareil ══════════
  { ...ACCOUNT, key: 'lo-yanum:theme:', family: true, label: 'thème des autres rôles (volontaire, agriculteur, chauffeur) : light | dark | system', fallback: null, fallbackNote: 'sombre (rôles de terrain)', validate: themeChoice, owner: 'src/ui/theme.tsx', syncedBefore: 'no', arbitrate: 'compte — mais ces rôles entrent sans compte (lien d’agriculteur, de gardien) : sans session, la valeur reste dans la copie locale ; elle ne voyage que pour un rôle connecté' },
  { ...ACCOUNT, key: 'lo-yanum:map-base', label: 'fond de carte : vector | satellite', fallback: null, fallbackNote: 'vector (plan)', validate: oneOf('satellite', 'vector'), owner: 'src/ui/components/mapBase.ts', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:layout-sync', label: 'disposition commune à tous les écrans de carte : « synced » ou absente', fallback: null, fallbackNote: 'chaque écran garde la sienne', validate: oneOf('synced'), owner: 'src/ui/components/mapMode.tsx', syncedBefore: 'no', lie: 'he.json settings.display.hint disait « ההגדרות האלה נשמרות במכשיר הזה בלבד » — vrai avant BJ, faux depuis ; et « מסונכרן » y désigne les ÉCRANS, pas les appareils' },
  { ...ACCOUNT, key: 'lo-yanum:map-last', label: 'dernier écran de carte ouvert (identifiant d’écran)', fallback: null, fallbackNote: 'aucun (rien à répandre)', validate: nonEmpty, owner: 'src/ui/components/mapMode.tsx', syncedBefore: 'no', arbitrate: 'compte — sert seulement à répandre une disposition quand on passe en « מסונכרן » ; aucun inconvénient connu à le partager' },
  { ...ACCOUNT, key: 'lo-yanum:map-mode:', family: true, label: 'mode d’un écran de carte : hidden | split | full (par écran)', fallback: null, fallbackNote: 'split (carte ET contenu)', validate: mapMode, owner: 'src/ui/components/mapMode.tsx', syncedBefore: 'no', arbitrate: 'compte — mais un téléphone et un ordinateur n’ont pas la même place : un « carte seule » choisi au téléphone s’applique à l’ordinateur. Recommandation : compte (règle du PO) ; si gênant, passer à « appareil » ou à une valeur par largeur' },
  { ...ACCOUNT, key: 'lo-yanum:map-ratio:', family: true, label: 'largeur de la colonne de contenu, en % (25–75, par écran)', fallback: null, fallbackNote: 'largeur propre à chaque écran', validate: num(25, 75), owner: 'src/ui/components/mapMode.tsx', syncedBefore: 'no', arbitrate: 'compte, provisoirement — recommandation : APPAREIL. Un pourcentage choisi sur un écran de 27″ n’a pas de sens sur un iPad (lié à la taille physique de l’écran)' },
  { ...ACCOUNT, key: 'lo-yanum:rail:expanded', label: 'rail latéral déplié (« 1 ») ou compact (« 0 »)', fallback: null, fallbackNote: 'déplié au-delà de 1 600 px, compact en dessous', validate: bit, owner: 'src/ui/components/layouts.tsx', syncedBefore: 'no', arbitrate: 'compte, provisoirement — recommandation : APPAREIL (dépend de la largeur de l’écran ; le défaut s’y adapte déjà)' },
  { ...ACCOUNT, key: 'lo-yanum:block:', family: true, label: 'bloc replié ou déplié, par TYPE de bloc (« 1 » / « 0 »)', fallback: null, fallbackNote: 'ouverture par défaut du bloc', validate: bit, owner: 'src/ui/components/primitives.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'farm-form-', family: true, label: 'section du formulaire de ferme repliée (« 1 » ouverte / « 0 », par section et par ferme)', fallback: null, fallbackNote: 'ouverte', validate: bit, owner: 'src/ui/components/fields.tsx', syncedBefore: 'no', arbitrate: 'compte, provisoirement (était sessionStorage : oublié à la fermeture de l’onglet). Recommandation : compte, mais par TYPE de section comme `block:` plutôt que par ferme — une ligne par ferme et par section s’accumule' },
  { ...ACCOUNT, key: 'lo-yanum:farm-tab:', family: true, label: 'onglet ouvert d’une fiche de ferme (farm | people | guards | terrain | docs | log)', fallback: null, fallbackNote: 'farm', validate: oneOf('farm', 'people', 'guards', 'terrain', 'docs', 'log'), owner: 'src/ui/farm/farmTabs.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:leads-sort', label: 'tri du tableau des pistes (JSON {key, dir}, ou mot d’avant AX5)', fallback: null, fallbackNote: 'plus récentes d’abord', validate: nonEmpty, owner: 'src/ui/screens/coordinator/LeadsScreen.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:institutions-sort', label: 'tri du tableau des institutions (JSON {key, dir})', fallback: null, fallbackNote: 'tri livré', validate: sortState, owner: 'src/ui/screens/coordinator/InstitutionsScreen.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:people-sort', label: 'tri du tableau des volontaires (JSON {key, dir})', fallback: null, fallbackNote: 'tri livré', validate: sortState, owner: 'src/ui/screens/coordinator/VolunteersScreen.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:people-grouped', label: 'volontaires groupés par région (« 1 » / « 0 »)', fallback: null, fallbackNote: 'non groupés', validate: bit, owner: 'src/ui/screens/coordinator/VolunteersScreen.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:coverage-band', label: 'bandeau des réglages de couverture (open | folded)', fallback: null, fallbackNote: 'replié', validate: oneOf('open', 'folded'), owner: 'src/ui/screens/coordinator/CoverageScreen.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:coverage-farm-card', label: 'fiche compacte de ferme dépliée (open | closed)', fallback: null, fallbackNote: 'repliée', validate: oneOf('open', 'closed'), owner: 'src/ui/institutions/CoverageFarmCard.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:tasks:list', label: 'dernière liste de tâches choisie pour un ajout rapide (identifiant)', fallback: null, fallbackNote: 'la première liste', validate: nonEmpty, owner: 'src/ui/tasks/TaskQuickAdd.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:tasks:tab', label: 'onglet du panneau des tâches (identifiant)', fallback: null, fallbackNote: 'onglet livré', validate: nonEmpty, owner: 'src/ui/tasks/TasksPane.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:search:recent', label: 'recherches récentes (JSON tableau)', fallback: null, fallbackNote: 'aucune', validate: jsonArray, owner: 'src/ui/search/GlobalSearch.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:sheet-mapping:', family: true, label: 'correspondance des colonnes du dernier fichier importé (JSON objet, par type)', fallback: null, fallbackNote: 'devinée depuis l’en-tête', validate: jsonObject, owner: 'src/ui/screens/coordinator/SheetImportScreen.tsx', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:intake:seen', label: 'demandes entrantes déjà vues (JSON tableau d’identifiants, 200 au plus)', fallback: null, fallbackNote: 'aucune vue (le bandeau s’affiche)', validate: jsonArray, owner: 'src/ui/intake/intakeState.ts', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:report-recipient', label: 'destinataire du compte rendu (adresse)', fallback: null, fallbackNote: 'aucun (le bouton le dit)', validate: any, owner: 'src/ui/report/recipient.ts', syncedBefore: 'no' },
  { ...ACCOUNT, key: 'lo-yanum:activity-reports', label: 'historique des comptes rendus générés (JSON tableau, 24 au plus)', fallback: null, fallbackNote: 'vide', validate: jsonArray, owner: 'src/ui/report/activityHistory.ts', syncedBefore: 'no', arbitrate: 'compte, provisoirement — recommandation : lire l’historique dans la table `activity_reports` (la base en garde déjà la trace) et retirer cette clé' },
  { ...ACCOUNT, key: 'lo-yanum:free-route-draft', label: 'itinéraire libre EN COURS de composition (JSON objet)', fallback: null, fallbackNote: 'aucun', validate: jsonObject, owner: 'src/ui/settings/freeRoutes.ts', syncedBefore: 'no', arbitrate: 'compte, provisoirement — c’est un travail en cours, pas un tracé au doigt : commencé au bureau, il se reprend au téléphone. Recommandation : compte' },

  // ══════════ SUR L'APPAREIL — les quatre raisons admises ══════════
  { key: 'lo-yanum:zone-draft:', family: true, area: 'local', scope: 'device', reason: 'draft', why: 'le tracé NON fermé d’une forme appartient au geste en cours sur cet écran (BI, point 7)', label: 'brouillons de tracé d’une ferme (JSON tableau)', fallback: null, fallbackNote: 'aucun brouillon', validate: jsonArray, owner: 'src/ui/farm/zoneDraft.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:settings-queue', area: 'local', scope: 'device', reason: 'offline', why: 'les modifications de réglages pas encore reçues par le serveur ; vidée à chaque envoi réussi', label: 'file d’attente des réglages (JSON objet : clé → valeur, instant du geste)', fallback: null, fallbackNote: 'vide', validate: jsonObject, owner: 'src/storage/account.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum', area: 'idb', scope: 'device', reason: 'offline', why: 'la file des écritures de données hors ligne (`outbox`) et la copie hors ligne qui sert l’écran sans réseau (`aggregates`) ; la source est la base', label: 'base IndexedDB « lo-yanum » : magasins `aggregates` et `outbox`', fallback: null, fallbackNote: 'vide (relue depuis le serveur)', validate: any, owner: 'src/storage/idb.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum-shell-', family: true, area: 'cache', scope: 'device', reason: 'offline', why: 'l’application elle-même, gardée pour s’ouvrir sans réseau (service worker)', label: 'Cache Storage : fichiers de l’application, par version', fallback: null, fallbackNote: 'vide (re-téléchargé)', validate: any, owner: 'public/sw.js', syncedBefore: 'n/a' },
  { key: 'lo-yanum-basemap', area: 'cache', scope: 'device', reason: 'offline', why: 'la carte d’Israël téléchargée pour le hors-ligne (≈ centaines de Mo) : un fichier de CET appareil', label: 'Cache Storage : fond de carte PMTiles', fallback: null, fallbackNote: 'carte en ligne', validate: any, owner: 'public/sw.js', syncedBefore: 'n/a' },
  { key: 'lo-yanum:auth', area: 'local', scope: 'device', reason: 'auth', why: 'la session Supabase (jetons) de cet appareil', label: 'session Supabase (JSON, écrit par supabase-js via `authStorage`)', fallback: null, fallbackNote: 'déconnecté', validate: any, owner: 'src/data/client.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum:auth-', family: true, area: 'local', scope: 'device', reason: 'auth', why: 'clés annexes de supabase-js (`-code-verifier`, `-user`) : la même session', label: 'annexes de session supabase-js', fallback: null, fallbackNote: 'absentes', validate: any, owner: 'src/data/client.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum:last-session', area: 'local', scope: 'device', reason: 'auth', why: 'qui était connecté ICI en dernier, pour rouvrir hors ligne', label: 'dernière session (JSON {userId, email})', fallback: null, fallbackNote: 'aucune', validate: jsonObject, owner: 'src/data/auth.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum:last-email', area: 'local', scope: 'device', reason: 'auth', why: 'le mail pré-rempli de l’écran de connexion de cet appareil', label: 'dernier mail saisi (texte)', fallback: null, fallbackNote: 'vide', validate: any, owner: 'src/data/auth.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum:farmer-pass', area: 'local', scope: 'device', reason: 'auth', why: 'laissez-passer d’un agriculteur entré par son lien : la session de cet appareil, sans compte', label: 'jeton du lien d’agriculteur (texte encodé)', fallback: null, fallbackNote: 'aucun', validate: any, owner: 'src/ui/farmerPass.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:guard-pass', area: 'local', scope: 'device', reason: 'auth', why: 'laissez-passer d’un gardien : idem', label: 'jeton du lien de garde (JSON objet)', fallback: null, fallbackNote: 'aucun', validate: jsonObject, owner: 'src/ui/guardPass.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:link-unlock', area: 'local', scope: 'device', reason: 'auth', why: 'compte des échecs aux quatre chiffres d’un lien (AG2) : l’envoyer ailleurs annulerait la temporisation', label: 'déverrouillages et échecs par lien (JSON objet)', fallback: null, fallbackNote: 'aucun échec', validate: jsonObject, owner: 'src/ui/challenge.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:view-as', area: 'local', scope: 'device', reason: 'diagnostic', why: '« voir comme » est un aperçu du coordinateur ; partagé, il ouvrirait le téléphone en vue de volontaire', label: 'aperçu « voir comme » (JSON {role, name, detail})', fallback: null, fallbackNote: 'vue du coordinateur', validate: jsonObject, owner: 'src/ui/settings/viewAs.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:numpad', area: 'local', scope: 'device', reason: 'diagnostic', why: 'drapeau de test qui force le pavé numérique (on | off) ; aucun écran ne l’écrit', label: 'pavé numérique forcé (on | off)', fallback: null, fallbackNote: 'décidé sur l’appareil (iPad → pavé)', validate: oneOf('on', 'off'), owner: 'src/ui/components/NumericPad.tsx', syncedBefore: 'no' },
  { key: 'lo-yanum:geo-diag', area: 'local', scope: 'device', reason: 'diagnostic', why: 'journal de localisation de CET appareil (AG7), lu dans הגדרות', label: 'lignes de diagnostic de localisation (JSON)', fallback: null, fallbackNote: 'vide', validate: any, owner: 'src/ui/geoDiagnostics.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:map-attempt', area: 'local', scope: 'device', reason: 'diagnostic', why: 'résultat du dernier téléchargement de la carte hors ligne SUR cet appareil', label: 'dernière tentative de téléchargement de carte (JSON objet)', fallback: null, fallbackNote: 'aucune', validate: jsonObject, owner: 'src/ui/offline.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:update-verdict', area: 'local', scope: 'device', reason: 'diagnostic', why: 'ce que la dernière vérification de version a répondu à CET appareil (AJ)', label: 'verdict de mise à jour (JSON)', fallback: null, fallbackNote: 'aucun', validate: any, owner: 'src/ui/update.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:map-layers-bi', area: 'local', scope: 'device', reason: 'diagnostic', why: 'trace de la réactivation des formes d’avant BI sur CET appareil, lue par le diagnostic', label: 'trace BI (JSON {at, restored})', fallback: null, fallbackNote: 'aucune', validate: jsonObject, owner: 'src/ui/components/mapLayers.ts', syncedBefore: 'no' },
  { key: 'lo-yanum:settings-sync-report', area: 'local', scope: 'device', reason: 'diagnostic', why: 'le compte rendu du dernier cycle de synchronisation DE CET appareil (AT1)', label: 'dernier cycle de synchronisation (JSON objet)', fallback: null, fallbackNote: 'aucun', validate: jsonObject, owner: 'src/storage/account.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum:settings-meta', area: 'local', scope: 'device', reason: 'diagnostic', why: 'ce que CET appareil sait du compte : instant serveur de chaque valeur, curseur de relecture, écart d’horloge', label: 'mémoire de synchronisation (JSON objet)', fallback: null, fallbackNote: 'jamais synchronisé', validate: jsonObject, owner: 'src/storage/account.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum:settings-migration', area: 'local', scope: 'device', reason: 'diagnostic', why: 'la migration BJ de CET appareil : sa date et ce qu’elle a fait, lue par le diagnostic', label: 'trace de migration BJ (JSON objet)', fallback: null, fallbackNote: 'pas encore migré', validate: jsonObject, owner: 'src/storage/account.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum:settings-stamps', area: 'local', scope: 'device', reason: 'diagnostic', why: 'instants d’APPAREIL d’avant BJ (AS4) : lus une fois par la migration, puis effacés', label: 'instants d’avant BJ (JSON objet)', fallback: null, fallbackNote: 'aucun', validate: jsonObject, owner: 'src/storage/account.ts', syncedBefore: 'n/a' },
  { key: 'lo-yanum:settings-synced-at', area: 'local', scope: 'device', reason: 'diagnostic', why: 'dernière synchronisation d’avant BJ : effacée par la migration', label: 'instant (nombre)', fallback: null, fallbackNote: 'aucun', validate: jsonNumber, owner: 'src/storage/account.ts', syncedBefore: 'n/a' },

  // ══════════ SUR L'APPAREIL — « la machine elle-même » : À ARBITRER ══════════
  { key: 'lo-yanum:last-fix', area: 'local', scope: 'device', reason: 'machine', why: 'la dernière position GPS de CET appareil : celle du téléphone n’est pas celle de l’ordinateur', label: 'dernier relevé GPS (JSON {position, accuracy, at})', fallback: null, fallbackNote: 'aucun', validate: jsonObject, owner: 'src/ui/geolocate.ts', syncedBefore: 'no', arbitrate: 'appareil, recommandé : une position est celle d’une machine physique' },
  { key: 'lo-yanum:geo-granted', area: 'local', scope: 'device', reason: 'machine', why: 'CET navigateur a-t-il déjà accordé la localisation (une autorisation du navigateur, qui ne voyage pas)', label: 'instant du premier relevé accordé (nombre)', fallback: null, fallbackNote: 'jamais', validate: any, owner: 'src/ui/geolocate.ts', syncedBefore: 'no', arbitrate: 'appareil, recommandé : c’est l’autorisation de CE navigateur' },
  { key: 'lo-yanum:update-pending', area: 'local', scope: 'device', reason: 'machine', why: 'la version vers laquelle CET appareil est en train de se mettre à jour (AJ)', label: 'mise à jour en cours (JSON)', fallback: null, fallbackNote: 'aucune', validate: any, owner: 'src/ui/update.ts', syncedBefore: 'no', arbitrate: 'appareil, recommandé : c’est le build installé sur cette machine' },
  { key: 'lo-yanum:road-mesh:v1', area: 'local', scope: 'device', reason: 'machine', why: 'distances routières CALCULÉES sur la carte téléchargée par CET appareil (recalculables, plusieurs centaines de ko)', label: 'mémoire des trajets calculés (JSON {archive, pairs})', fallback: null, fallbackNote: 'recalculé', validate: jsonObject, owner: 'src/ui/routing/roadMesh.ts', syncedBefore: 'no', arbitrate: 'appareil, recommandé : un cache de calcul, pas un réglage — le partager enverrait des centaines de ko pour rien' },
]

// ---------------------------------------------------------------------------
// La recherche d'une clé
// ---------------------------------------------------------------------------

const exact = new Map<string, SettingDef>()
const families: SettingDef[] = []
for (const def of SETTINGS) {
  if (def.family) families.push(def)
  else exact.set(def.key, def)
}
families.sort((a, b) => b.key.length - a.key.length)

/** La déclaration d'une clé (exacte d'abord, puis la famille au plus long préfixe). `null` = NON DÉCLARÉE. */
export function settingDef(key: string): SettingDef | null {
  const e = exact.get(key)
  if (e) return e
  for (const f of families) if (key.startsWith(f.key) && key.length > f.key.length) return f
  return null
}

export const isAccountKey = (key: string): boolean => settingDef(key)?.scope === 'account'

/** ★ La valeur brute est-elle lisible ? `null` (absente) l'est toujours. */
export function isValidSetting(key: string, raw: string | null): boolean {
  if (raw === null) return true
  const def = settingDef(key)
  return def ? def.validate(raw) : false
}

/** Les clés EXACTES de portée « compte » (pour la synchronisation et le diagnostic). */
export const ACCOUNT_KEYS: readonly string[] = SETTINGS.filter((d) => d.scope === 'account' && !d.family).map((d) => d.key)

/** Les clés d'avant BJ que l'ancien bloc `user_settings` portait (lues une fois à la migration). */
export const LEGACY_BLOB_KEYS: readonly string[] = SETTINGS.filter((d) => d.syncedBefore === 'yes' || d.syncedBefore === 'partial').map((d) => d.key)

/** ★ Les réglages « à arbitrer », pour le PO. */
export const TO_ARBITRATE: readonly SettingDef[] = SETTINGS.filter((d) => d.arbitrate !== undefined)
