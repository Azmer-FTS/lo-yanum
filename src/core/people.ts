import type { FarmContact } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AM2 (2026-09-16) — LES PERSONNES D'UNE FICHE, EN UN SEUL ENDROIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le constat du PO, sur la fiche de דני בראל : le nom et le portable sont
 * enregistrés, et le formulaire lui propose « הוספת איש קשר » avec des champs
 * vides. La personne connue n'apparaît que plus bas, dans un bloc replié, et sa
 * ת״ז encore ailleurs. Il ne sait plus où saisir, et il retape ce qui existe.
 *
 * ★ LA CAUSE EST DANS LE MODÈLE, PAS DANS LA MISE EN PAGE. La même personne a
 *   deux enregistrements : les colonnes `farmer*` (le חקלאי du classeur, celui
 *   qui signe — c'est là qu'AK1 a écrit les quinze fiches) et la ligne de
 *   `contacts` marquée `isPrimary` (celle que lisent la connexion de
 *   l'agriculteur, l'écran d'urgence, la garde). AH1.1 les « proposait l'une
 *   dans l'autre » ; c'était encore deux champs pour une vérité.
 *
 * ★ CE MODULE EN FAIT UNE CARTE. `splitPeople` lit la fiche et rend LA carte
 *   de l'agriculteur — ses colonnes, fusionnées avec la ligne de contact qui
 *   est la même personne — et les AUTRES contacts. `mergePeople` écrit la carte
 *   aux deux endroits à la fois. Le schéma ne change pas : c'est l'écran qui
 *   cesse de montrer deux fois la même personne.
 *
 * ⚠️ « LA MÊME PERSONNE » SE DÉCIDE SUR UN FAIT, PAS SUR UNE POSITION : même
 *    nom (à la ponctuation près) ou même numéro (aux chiffres près). Une fiche
 *    dont le חקלאי et le contact principal sont deux personnes différentes
 *    garde DEUX cartes — les fondre ferait signer l'un avec le téléphone de
 *    l'autre.
 *
 * PUR : ni DOM, ni React.
 */

export interface PersonCard {
  /** La ligne de `contacts` qui est cette personne, s'il y en a une. */
  contactId: string | null
  name: string
  phone: string
  /** ת״ז / ח״פ — n'existe que pour l'agriculteur (c'est lui qui signe). */
  idNumber: string
  email: string
  role: string
  photo: string | null
  isPrimary: boolean
}

export interface PeopleSources {
  farmerName?: string
  farmerPhone?: string
  farmerEmail?: string
  farmerId?: string
  contacts: readonly FarmContact[]
}

const digits = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '')
const plain = (s: string | null | undefined): string =>
  (s ?? '').replace(/[׳״'"`\-־.,]/g, ' ').replace(/\s+/g, ' ').trim()

/** Deux enregistrements décrivent-ils la même personne ? */
export function samePerson(
  a: { name?: string; phone?: string },
  b: { name?: string; phone?: string },
): boolean {
  const an = plain(a.name)
  const bn = plain(b.name)
  if (an !== '' && an === bn) return true
  const ap = digits(a.phone)
  const bp = digits(b.phone)
  return ap.length >= 7 && ap === bp
}

export interface SplitPeople {
  farmer: PersonCard
  others: FarmContact[]
}

export function splitPeople(src: PeopleSources): SplitPeople {
  const contacts = src.contacts
  const farmerKnown = (src.farmerName ?? '').trim() !== '' || (src.farmerPhone ?? '').trim() !== ''
  const primary = contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null

  /* La ligne de contact qui EST l'agriculteur : celle qui lui ressemble ; à
     défaut, quand la fiche n'a pas d'agriculteur du tout, le contact
     principal (il est alors l'agriculteur que l'on connaît). */
  const linked = farmerKnown
    ? contacts.find((c) => samePerson({ name: src.farmerName, phone: src.farmerPhone }, c)) ?? null
    : primary

  const farmer: PersonCard = {
    contactId: linked?.id ?? null,
    name: (src.farmerName ?? '').trim() || (linked?.name ?? ''),
    phone: (src.farmerPhone ?? '').trim() || (linked?.phone ?? ''),
    idNumber: src.farmerId ?? '',
    email: (src.farmerEmail ?? '').trim() || (linked?.email ?? ''),
    role: linked?.role ?? '',
    photo: linked?.photo ?? null,
    /* Sans aucun contact, l'agriculteur EST le principal ; sinon le drapeau
       de sa ligne dit s'il l'est. */
    isPrimary: linked ? linked.isPrimary || (!contacts.some((c) => c.isPrimary) && contacts[0] === linked) : contacts.length === 0,
  }
  return { farmer, others: contacts.filter((c) => c !== linked) }
}

export interface MergedPeople {
  farmerName: string
  farmerPhone: string
  farmerEmail: string
  farmerId: string
  contacts: FarmContact[]
}

/**
 * La carte de l'agriculteur et les autres contacts → ce que la fiche
 * enregistre. `newId` fabrique l'identifiant d'une ligne de contact neuve.
 *
 * ★ Une carte d'agriculteur qui porte un nom ou un numéro devient AUSSI la
 *   ligne de contact correspondante : c'est ce qui fait que דני בראל, tapé une
 *   fois, peut se connecter comme agriculteur et apparaît à l'écran d'urgence.
 * ★ Une ligne sans nom ni numéro est une ligne commencée puis abandonnée : elle
 *   n'est pas enregistrée (jamais d'erreur « שדה חובה » sur un bloc vide).
 * ★ Il reste exactement UN principal dès qu'il y a un contact.
 */
export function mergePeople(
  farmer: PersonCard,
  others: readonly FarmContact[],
  newId: () => string,
): MergedPeople {
  const t = (s: string) => s.trim()
  const rows: FarmContact[] = []
  if (t(farmer.name) !== '' || t(farmer.phone) !== '') {
    rows.push({
      id: farmer.contactId ?? newId(),
      name: t(farmer.name),
      phone: t(farmer.phone),
      email: t(farmer.email),
      role: t(farmer.role),
      photo: farmer.photo,
      isPrimary: farmer.isPrimary,
    })
  }
  for (const c of others) {
    if (t(c.name) === '' && t(c.phone) === '') continue
    rows.push({ ...c, name: t(c.name), phone: t(c.phone), email: t(c.email), role: t(c.role) })
  }
  const primaries = rows.filter((c) => c.isPrimary)
  if (rows.length > 0 && primaries.length !== 1) {
    const keep = primaries[0] ?? rows[0]
    for (const c of rows) c.isPrimary = c === keep
  }
  return {
    farmerName: t(farmer.name),
    farmerPhone: t(farmer.phone),
    farmerEmail: t(farmer.email),
    farmerId: t(farmer.idNumber),
    contacts: rows,
  }
}

// ---------------------------------------------------------------------------
// ★★ BA (2026-10-12) — LES CONTACTS D'UNE FERME, UNE LISTE ORDONNÉE.
// ---------------------------------------------------------------------------

/**
 * Le même modèle que les institutions en AZ5, à la mesure d'une ferme : une
 * liste ORDONNÉE (`contacts`, dans l'ordre de `entity_contacts.position`),
 * sans hiérarchie de rôles. Le RANG 1 (`contacts[0]`) est l'agriculteur — celui
 * qui signe — et lui SEUL représente la ferme partout où l'application montre
 * « le contact » (tableau, vignette, aperçu, garde, urgence). `farmerName` /
 * `farmerPhone` sont son MIROIR.
 *
 * Deux sens d'écriture, et la règle qui les réconcilie (`settleFarmContacts`,
 * appelée à chaque `commit` du store et au chargement) :
 *   · la liste a été réordonnée ou modifiée (éditeur de la fiche) → elle
 *     gagne : le miroir est recopié depuis le rang 1 (`setFarmContacts`) ;
 *   · un chemin d'avant BA a écrit `farmerName` / `farmerPhone` (import du
 *     portail, de l'association, formulaire) → l'agriculteur gagne : s'il est
 *     déjà dans la liste (même téléphone, sinon même nom), il remonte au rang
 *     1 ; sinon il y ENTRE au rang 1 et l'ancien rang 1 descend au rang 2 —
 *     jamais écrasé, jamais perdu.
 * Le rang 1 est le seul `isPrimary` (la connexion de l'agriculteur).
 *
 * Renvoie LA MÊME RÉFÉRENCE quand rien ne change : le store compare les
 * enregistrements pour savoir quoi pousser.
 */
export interface FarmPeople {
  id: string
  farmerName?: string
  farmerPhone?: string
  contacts: FarmContact[]
}

/** Le rang 1, ou `null`. */
export const farmRank1 = (f: Pick<FarmPeople, 'contacts'>): FarmContact | null => f.contacts[0] ?? null

/**
 * Le nom qu'on affiche sous la ferme : le rang 1, sinon le miroir (une fiche
 * qui n'a encore jamais été réconciliée). Vide quand personne n'est connu.
 */
export function farmPersonName(f: Pick<FarmPeople, 'contacts' | 'farmerName'>): string {
  return (f.contacts[0]?.name ?? '').trim() || (f.farmerName ?? '').trim()
}

/** Le téléphone du rang 1, même règle. */
export function farmPersonPhone(f: Pick<FarmPeople, 'contacts' | 'farmerPhone'>): string {
  return (f.contacts[0]?.phone ?? '').trim() || (f.farmerPhone ?? '').trim()
}

function sameContactPerson(farmer: { name?: string; phone?: string }, c: FarmContact): boolean {
  const fp = digits(farmer.phone)
  const cp = digits(c.phone)
  if (fp.length >= 7 && cp.length >= 7) return fp.replace(/^972/, '0') === cp.replace(/^972/, '0')
  return samePerson(farmer, c)
}

export function settleFarmContacts<T extends FarmPeople>(farm: T): T {
  const name = (farm.farmerName ?? '').trim()
  const phone = (farm.farmerPhone ?? '').trim()
  let contacts = farm.contacts
  if (name !== '' || phone !== '') {
    const at = contacts.findIndex((c) => sameContactPerson({ name, phone }, c))
    if (at === -1) {
      contacts = [{ id: `fc-${farm.id}-${contacts.length + 1}`, name, phone, email: '', role: '', photo: null, isPrimary: true }, ...contacts]
    } else {
      const c = contacts[at]
      const filled = { ...c, name: name || c.name, phone: phone || c.phone }
      if (at !== 0 || filled.name !== c.name || filled.phone !== c.phone) {
        contacts = [filled, ...contacts.filter((_, i) => i !== at)]
      }
    }
  } else {
    /* Pas de miroir : le contact principal d'avant BA EST l'agriculteur
       connu ; il prend le rang 1 au lieu de perdre son drapeau. */
    const at = contacts.findIndex((c) => c.isPrimary)
    if (at > 0) contacts = [contacts[at], ...contacts.filter((_, i) => i !== at)]
  }
  if (contacts.some((c, i) => c.isPrimary !== (i === 0))) {
    contacts = contacts.map((c, i) => (c.isPrimary === (i === 0) ? c : { ...c, isPrimary: i === 0 }))
  }
  const r1 = contacts[0]
  const mirrorName = r1 ? r1.name : farm.farmerName
  const mirrorPhone = r1 ? r1.phone : farm.farmerPhone
  if (contacts === farm.contacts && mirrorName === farm.farmerName && mirrorPhone === farm.farmerPhone) return farm
  return { ...farm, contacts, farmerName: mirrorName, farmerPhone: mirrorPhone }
}

/**
 * L'éditeur de la fiche écrit la LISTE : elle gagne. Le miroir suit le rang 1 ;
 * une ligne sans nom ni numéro n'est pas gardée.
 */
export function withFarmContacts<T extends FarmPeople>(farm: T, list: readonly FarmContact[]): T {
  const contacts = list
    .filter((c) => c.name.trim() !== '' || c.phone.trim() !== '')
    .map((c, i) => ({ ...c, name: c.name.trim(), phone: c.phone.trim(), isPrimary: i === 0 }))
  const r1 = contacts[0]
  return { ...farm, contacts, farmerName: r1 ? r1.name : '', farmerPhone: r1 ? r1.phone : '' }
}

/** ★★ BA — la seule lecture de « נוצר קשר » : absent = établi. */
export const isContactEstablished = (f: { contactEstablished?: boolean }): boolean => f.contactEstablished !== false

/**
 * ★★ BA — LA RÈGLE DU PO, MÉCANIQUE, pour une ligne d'export du portail : le
 * contact est établi si la ligne porte des coordonnées OU une note interne.
 */
export const portalContactEstablished = (row: { position: unknown; notes?: string }): boolean =>
  row.position != null || (row.notes ?? '').trim() !== ''
