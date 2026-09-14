import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AI1 · AI2 (2026-09-14) — LE TRACÉ SUR ROUTE, HORS LIGNE, SUR L'APPAREIL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « L'itinéraire libre d'AH9 trace des segments à vol d'oiseau. Sur une
 *     route qui contourne un wadi, l'écart réel atteint 30 à 40 %. »
 *
 * ⛔ AUCUN SERVICE EXTERNE — décision du PO, pour le coût et surtout parce
 *    qu'envoyer les coordonnées de chaque agriculteur à un tiers n'est pas
 *    acceptable pour des exploitations dont on cartographie les zones de
 *    garde. Ni Google, ni Mapbox, ni OSRM en ligne, pas même « pour comparer ».
 *
 * ★★ LA VOIE : LE RÉSEAU EST DÉJÀ DANS L'APPAREIL. L'archive PMTiles de la
 *    carte (OpenStreetMap, découpe Protomaps, z14) porte une couche `roads`
 *    avec `kind`, `kind_detail` (motorway → track) et `oneway`. Ce module en
 *    fait un graphe et y cherche le plus court chemin EN TEMPS. Le chargement
 *    des tuiles est dans `ui/routing/roadNetwork.ts` ; ici tout est PUR : ni
 *    DOM, ni réseau, ni stockage — ce qui permet à `bun run aipass` de le
 *    vérifier sans navigateur, sur l'archive elle-même.
 *
 * ★ UN SOMMET PAR POINT DE LA GÉOMÉTRIE, UNE ARÊTE PAR SEGMENT. Pas de
 *   contraction : sur la surface d'une tournée, quelques centaines de milliers
 *   de sommets tiennent en mémoire et A* y répond en dizaines de
 *   millisecondes. Une contraction coûterait une passe de plus à chaque tuile
 *   ajoutée, pour un gain que la mesure n'a pas demandé.
 *
 * ⚠️ LES TUILES COUPENT LES ROUTES, ET C'EST LE PIÈGE DE CETTE VOIE. Une route
 *    qui traverse le bord d'une tuile y est découpée, avec une marge qui
 *    recouvre la voisine. Chaque ligne est donc recoupée ICI au bord EXACT de
 *    sa tuile, et le point de sortie calculé des deux côtés tombe au même
 *    endroit (au quantum de la tuile près, ~0,6 m à z14). Les sommets sont
 *    ensuite fusionnés sur une grille de ~1,1 m en regardant les cases
 *    voisines — sans quoi le graphe serait un damier de 2,4 km de côté où
 *    rien ne se rejoint.
 */

// ---------------------------------------------------------------------------
// Les vitesses — AI2.3, en constantes nommées
// ---------------------------------------------------------------------------

/**
 * ★★ DES MOYENNES DE ROULAGE, PAS DES LIMITES LÉGALES. Une limite est ce qu'on
 *    n'a pas le droit de dépasser ; une durée se calcule sur ce qu'on roule
 *    vraiment, entrées, sorties, ronds-points et tracteurs compris.
 *
 * ⚠️ ET LA PISTE N'EST PAS UNE ROUTE. Le Néguev et les accès de fermes sont
 *    faits de pistes (`highway=track`) : terre battue, ornières, portails. Leur
 *    appliquer la vitesse d'une route goudronnée annoncerait à un agriculteur
 *    une arrivée vingt minutes trop tôt sur les derniers kilomètres.
 */
/** Autoroute (כביש 1, כביש 6) : 110 autorisés, 95 roulés d'échangeur à échangeur. */
export const SPEED_MOTORWAY_KMH = 95
/** Voie express (`trunk` — כביש 40, 35 hors agglomération). */
export const SPEED_TRUNK_KMH = 80
/** Route principale (`primary` — כביש 38, 353). Villages, ronds-points. */
export const SPEED_PRIMARY_KMH = 70
/** Route secondaire (`secondary` — les routes régionales à trois chiffres). */
export const SPEED_SECONDARY_KMH = 60
/** Route tertiaire (`tertiary` — la desserte d'un moshav depuis la régionale). */
export const SPEED_TERTIARY_KMH = 50
/** Bretelle d'échangeur (`*_link`). */
export const SPEED_LINK_KMH = 40
/** Route non classée, chemin goudronné entre deux champs (`unclassified`). */
export const SPEED_UNCLASSIFIED_KMH = 40
/** Rue d'un village ou d'une ville (`residential`). */
export const SPEED_RESIDENTIAL_KMH = 30
/** Voie de service : cour de ferme, parking, accès privé (`service`). */
export const SPEED_SERVICE_KMH = 20
/** ★ Piste (`track`) : terre, ornières, portails. Le Néguev en est fait. */
export const SPEED_TRACK_KMH = 20
/** Rue piétonne ouverte aux véhicules (`living_street`, `pedestrian`). */
export const SPEED_LIVING_KMH = 10

/**
 * ★ LE DERNIER BOUT HORS RÉSEAU (AI2.5) — de la route la plus proche jusqu'au
 *   point collé, à travers ce que la carte ne connaît pas : un chemin de
 *   ferme non cartographié. Distance à vol d'oiseau × détour, à la vitesse
 *   d'une piste mauvaise.
 */
export const SPEED_OFFROAD_KMH = 12
export const OFFROAD_DETOUR = 1.3

/**
 * Au-delà de cette distance entre le point et la route la plus proche, le
 * point est dit HORS RÉSEAU dans la liste. En deçà c'est l'épaisseur d'une
 * route, d'un portail, d'un parking : pas une information.
 */
export const OFF_NETWORK_METERS = 60

/** La distance sous laquelle un bout pendant est relié à la route voisine. */
export const JOIN_METERS = 5

/** Le rayon au-delà duquel on ne rattache plus un point à une route. */
export const MAX_SNAP_METERS = 5_000

/**
 * La vitesse d'une catégorie, ou `null` quand la voie ne se roule pas en
 * voiture (sentier, escalier, piste cyclable, trottoir).
 */
export function speedFor(kindDetail: string, isLink: boolean): number | null {
  if (isLink) return SPEED_LINK_KMH
  switch (kindDetail) {
    case 'motorway':
      return SPEED_MOTORWAY_KMH
    case 'trunk':
      return SPEED_TRUNK_KMH
    case 'primary':
      return SPEED_PRIMARY_KMH
    case 'secondary':
      return SPEED_SECONDARY_KMH
    case 'tertiary':
      return SPEED_TERTIARY_KMH
    case 'motorway_link':
    case 'trunk_link':
    case 'primary_link':
    case 'secondary_link':
    case 'tertiary_link':
      return SPEED_LINK_KMH
    case 'unclassified':
    case 'road':
      return SPEED_UNCLASSIFIED_KMH
    case 'residential':
      return SPEED_RESIDENTIAL_KMH
    case 'service':
      return SPEED_SERVICE_KMH
    case 'track':
      return SPEED_TRACK_KMH
    case 'living_street':
    case 'pedestrian':
      return SPEED_LIVING_KMH
    default:
      return null
  }
}

/** La vitesse la plus haute : c'est elle qui rend l'heuristique d'A* admissible. */
const MAX_SPEED_KMH = SPEED_MOTORWAY_KMH

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

const R = 6_371_008.8
const RAD = Math.PI / 180

/** Distance en mètres — équirectangulaire, exacte au mètre sur quelques km. */
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const x = (bLng - aLng) * RAD * Math.cos(((aLat + bLat) / 2) * RAD)
  const y = (bLat - aLat) * RAD
  return Math.sqrt(x * x + y * y) * R
}

/** Tuile → longitude / latitude (Web Mercator). */
function tileToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180
}
function tileToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

export function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}
export function latToTileY(lat: number, z: number): number {
  const r = lat * RAD
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

// ---------------------------------------------------------------------------
// Les tuiles, telles que le chargeur les donne
// ---------------------------------------------------------------------------

/** Une route d'une tuile, déjà décodée. Coordonnées en unités de tuile. */
export interface RoadFeature {
  kind: string
  kindDetail: string
  isLink: boolean
  /** `'yes'` : dans le sens du tracé ; `'-1'` : à rebours ; sinon double sens. */
  oneway: string | null
  lines: Array<Array<{ x: number; y: number }>>
}

export interface RoadTile {
  z: number
  x: number
  y: number
  extent: number
  features: RoadFeature[]
}

// ---------------------------------------------------------------------------
// Le graphe
// ---------------------------------------------------------------------------

/** ~1,1 m de latitude : la grille de fusion des sommets. */
const SNAP_Q = 1e5
/** ~250 m : la grille qui retrouve l'arête la plus proche d'un point. */
const CELL_DEG = 0.0025

export interface GraphStats {
  tiles: number
  nodes: number
  edges: number
}

export class RoadGraph {
  readonly lat: number[] = []
  readonly lng: number[] = []
  /** Arêtes sortantes par sommet : indices dans les tableaux `e*`. */
  readonly out: number[][] = []
  readonly eFrom: number[] = []
  readonly eTo: number[] = []
  readonly eMeters: number[] = []
  readonly eSeconds: number[] = []
  /** Vitesse de l'arête — pour dire, ensuite, quelle part du trajet est en piste. */
  readonly eSpeed: number[] = []

  /** Nombre de voisins physiques (non orienté) — pour trouver les bouts pendants. */
  private readonly degree: number[] = []
  /** Les sommets déjà passés à la réparation : `[0, repairedUpTo[`. */
  private repairedUpTo = 0
  /** Les bouts pendants restés sans voisin : ils sont réexaminés au lot suivant. */
  private unresolved: number[] = []

  private readonly keyToNode = new Map<number, number>()
  /** Case de 250 m → segments (une arête « aller » par segment physique). */
  private readonly cells = new Map<number, number[]>()
  private readonly tiles = new Set<string>()
  private component: Int32Array | null = null
  private componentSize: number[] = []

  hasTile(z: number, x: number, y: number): boolean {
    return this.tiles.has(`${z}/${x}/${y}`)
  }

  stats(): GraphStats {
    return { tiles: this.tiles.size, nodes: this.lat.length, edges: this.eFrom.length }
  }

  private nodeAt(lat: number, lng: number, fuzzy: boolean): number {
    const qa = Math.round(lat * SNAP_Q)
    const qb = Math.round(lng * SNAP_Q)
    const exact = this.keyToNode.get(qa * 4e6 + qb)
    if (exact !== undefined) return exact
    /* ★ LES CASES VOISINES, AU BORD D'UNE TUILE SEULEMENT : deux calculs du même
       point de sortie, de part et d'autre, peuvent tomber dans deux cases
       voisines. À l'intérieur d'une tuile, un sommet partagé a les MÊMES
       coordonnées entières et la clé exacte suffit — et c'est 9 lectures de
       table de moins par sommet, mesuré à un tiers du temps de construction. */
    if (fuzzy) {
      for (let da = -1; da <= 1; da++) {
        for (let db = -1; db <= 1; db++) {
          if (da === 0 && db === 0) continue
          const hit = this.keyToNode.get((qa + da) * 4e6 + (qb + db))
          if (hit !== undefined) return hit
        }
      }
    }
    const id = this.lat.length
    this.lat.push(lat)
    this.lng.push(lng)
    this.out.push([])
    this.degree.push(0)
    this.keyToNode.set(qa * 4e6 + qb, id)
    return id
  }

  private index(edge: number): void {
    const a = this.eFrom[edge]
    const b = this.eTo[edge]
    const la0 = Math.floor(Math.min(this.lat[a], this.lat[b]) / CELL_DEG)
    const la1 = Math.floor(Math.max(this.lat[a], this.lat[b]) / CELL_DEG)
    const lo0 = Math.floor((Math.min(this.lng[a], this.lng[b]) + 180) / CELL_DEG)
    const lo1 = Math.floor((Math.max(this.lng[a], this.lng[b]) + 180) / CELL_DEG)
    for (let i = la0; i <= la1; i++) {
      for (let j = lo0; j <= lo1; j++) {
        const k = i * 1e6 + j
        const list = this.cells.get(k)
        if (list) list.push(edge)
        else this.cells.set(k, [edge])
      }
    }
  }

  private addEdge(a: number, b: number, speed: number, forward: boolean, backward: boolean): void {
    if (a === b) return
    this.degree[a] += 1
    this.degree[b] += 1
    const meters = metersBetween(this.lat[a], this.lng[a], this.lat[b], this.lng[b])
    const seconds = meters / ((speed * 1000) / 3600)
    let indexed = false
    const push = (from: number, to: number) => {
      const id = this.eFrom.length
      this.eFrom.push(from)
      this.eTo.push(to)
      this.eMeters.push(meters)
      this.eSeconds.push(seconds)
      this.eSpeed.push(speed)
      this.out[from].push(id)
      if (!indexed) {
        this.index(id)
        indexed = true
      }
    }
    if (forward) push(a, b)
    if (backward) push(b, a)
  }

  /**
   * Ajoute une tuile. Idempotent : une tuile déjà présente ne s'ajoute pas
   * deux fois, ce qui est la moitié d'AI4.2 (« le graphe ne se construit
   * qu'une fois ») ; l'autre moitié est que le graphe vit hors de l'écran.
   */
  addTile(tile: RoadTile): void {
    const key = `${tile.z}/${tile.x}/${tile.y}`
    if (this.tiles.has(key)) return
    this.tiles.add(key)
    this.component = null
    const E = tile.extent
    const toLatLng = (px: number, py: number): [number, number] => [
      tileToLat(tile.y + py / E, tile.z),
      tileToLng(tile.x + px / E, tile.z),
    ]

    for (const f of tile.features) {
      const speed = speedFor(f.kindDetail, f.isLink)
      if (speed === null) continue
      /* AI2.1 — le sens de circulation, quand OpenStreetMap le donne. */
      const forward = f.oneway !== '-1'
      const backward = f.oneway !== 'yes'
      for (const line of f.lines) {
        let prev: number | null = null
        for (let i = 1; i < line.length; i++) {
          const clipped = clipSegment(line[i - 1].x, line[i - 1].y, line[i].x, line[i].y, E)
          if (!clipped) {
            prev = null
            continue
          }
          const [x0, y0, x1, y1, enteredInside] = clipped
          const [aLat, aLng] = toLatLng(x0, y0)
          const [bLat, bLng] = toLatLng(x1, y1)
          const onEdge = (px: number, py: number) => px <= 1 || py <= 1 || px >= E - 1 || py >= E - 1
          const a = enteredInside && prev !== null ? prev : this.nodeAt(aLat, aLng, onEdge(x0, y0))
          const b = this.nodeAt(bLat, bLng, onEdge(x1, y1))
          this.addEdge(a, b, speed, forward, backward)
          prev = b
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Les jonctions que la découpe a défaites
  // -------------------------------------------------------------------------

  /**
   * ★★ AI2.1 — MESURÉ AVANT D'ÊTRE ÉCRIT : 11 648 BOUTS PENDANTS SUR 270 TUILES
   *    DE LA ZONE ADOULAM–LAKHISH, et des trajets rendus à 2,3 fois le vol
   *    d'oiseau. Dans OpenStreetMap une route secondaire partage un sommet
   *    avec la route qu'elle rejoint. La découpe en tuiles SIMPLIFIE les
   *    lignes : sur une route droite, le sommet de la jonction est colinéaire
   *    et disparaît. La route secondaire s'arrête alors à quelques
   *    décimètres de la principale sans la toucher, et le plus court chemin
   *    fait le tour par la jonction suivante — ou ne trouve rien.
   *
   * ★ LA RÉPARATION : un bout pendant (un seul voisin) à moins de
   *   `JOIN_METERS` d'une arête qui ne le touche pas y est RELIÉ, au point
   *   projeté, dans les sens que l'arête permet. Les deux arêtes d'origine
   *   restent ; on ajoute seulement le passage.
   *
   * ⚠️ LE PRIX, DIT : une impasse qui s'arrête réellement à 4 m d'une route
   *    sans y déboucher (un pont au-dessus, une barrière) sera reliée. Sur
   *    l'objectif d'AI3 — une heure d'arrivée qu'on tient — c'est très
   *    inférieur au coût inverse, qui était de ne pas trouver la jonction.
   *
   * À appeler après chaque lot de tuiles : un bout pendant au bord d'une
   * tuile trouve son vis-à-vis quand la voisine arrive.
   */
  repairJunctions(): number {
    let joinedNow = 0
    const n = this.lat.length
    /* ★ SEULEMENT LE NEUF ET CE QUI RESTAIT PENDANT. Repasser tous les sommets
       à chaque lot coûtait 450 ms sur 240 000 sommets ; un bout déjà relié
       n'a plus rien à gagner, un bout resté seul peut trouver son vis-à-vis
       dans la tuile qui vient d'arriver. */
    const candidates = this.unresolved
    for (let node = this.repairedUpTo; node < n; node++) {
      if (this.degree[node] === 1) candidates.push(node)
    }
    this.repairedUpTo = n
    const still: number[] = []
    for (const node of candidates) {
      if (this.degree[node] !== 1) continue
      const hit = this.nearestEdgeExcluding(node, JOIN_METERS)
      if (!hit) {
        still.push(node)
        continue
      }
      const { edge, t } = hit
      const a = this.eFrom[edge]
      const b = this.eTo[edge]
      const speed = this.eSpeed[edge]
      const twoWay = this.reverseOf(edge) !== -1
      const plat = this.lat[a] + t * (this.lat[b] - this.lat[a])
      const plng = this.lng[a] + t * (this.lng[b] - this.lng[a])
      // Un sommet NEUF au point projeté — jamais fusionné avec un voisin :
      // la grille de fusion rendrait ici le bout pendant lui-même.
      const p = this.lat.length
      this.lat.push(plat)
      this.lng.push(plng)
      this.out.push([])
      this.degree.push(0)
      this.addEdge(a, p, speed, true, twoWay)
      this.addEdge(p, b, speed, true, twoWay)
      this.addEdge(node, p, speed, true, true)
      joinedNow += 1
    }
    /* Les sommets fabriqués ici ne sont jamais pendants : pas besoin de les
       repasser au lot suivant. */
    this.repairedUpTo = this.lat.length
    this.unresolved = still
    if (joinedNow > 0) this.component = null
    return joinedNow
  }

  private nearestEdgeExcluding(node: number, maxMeters: number): { edge: number; t: number } | null {
    const lat0 = this.lat[node]
    const lng0 = this.lng[node]
    const kx = RAD * Math.cos(lat0 * RAD) * R
    const ky = RAD * R
    const ci = Math.floor(lat0 / CELL_DEG)
    const cj = Math.floor((lng0 + 180) / CELL_DEG)
    const neighbours = new Set<number>()
    for (const e of this.out[node]) neighbours.add(this.eTo[e])
    let best: { edge: number; t: number } | null = null
    let bestM = maxMeters
    /* ★ LA CASE VOISINE SEULEMENT SI LE SOMMET EST À MOINS DE `maxMeters` DE SON
       BORD : en ville une case de 250 m porte des milliers d'arêtes, et en
       ouvrir neuf par bout pendant coûtait l'essentiel de la réparation. */
    const fi = lat0 / CELL_DEG - ci
    const fj = (lng0 + 180) / CELL_DEG - cj
    const mi = maxMeters / (CELL_DEG * ky)
    const mj = maxMeters / (CELL_DEG * kx)
    const i0 = fi < mi ? ci - 1 : ci
    const i1 = fi > 1 - mi ? ci + 1 : ci
    const j0 = fj < mj ? cj - 1 : cj
    const j1 = fj > 1 - mj ? cj + 1 : cj
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const list = this.cells.get(i * 1e6 + j)
        if (!list) continue
        for (const e of list) {
          const a = this.eFrom[e]
          const b = this.eTo[e]
          if (a === node || b === node) continue
          const ax = (this.lng[a] - lng0) * kx
          const ay = (this.lat[a] - lat0) * ky
          const bx = (this.lng[b] - lng0) * kx
          const by = (this.lat[b] - lat0) * ky
          const dx = bx - ax
          const dy = by - ay
          const len2 = dx * dx + dy * dy
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
          const m = Math.hypot(ax + t * dx, ay + t * dy)
          if (m < bestM) {
            /* Une arête dont un bout est déjà le voisin du bout pendant est la
               route d'où il vient : s'y relier ne relie rien. */
            if (neighbours.has(a) || neighbours.has(b)) continue
            bestM = m
            best = { edge: e, t }
          }
        }
      }
    }
    return best
  }

  // -------------------------------------------------------------------------
  // Composantes FORTEMENT connexes
  // -------------------------------------------------------------------------

  /**
   * ⚠️★ FORTEMENT CONNEXES, ET LA PREMIÈRE VERSION NE L'ÉTAIT PAS. Une tournée
   *    partant du centre de Jérusalem ne trouvait AUCUN chemin : le point se
   *    rattachait à une voie de service de 30 sommets, reliée au reste de la
   *    ville… par des rues à sens unique qui y ENTRENT. Connexe si l'on
   *    oublie les sens, sans issue en voiture. Le rattachement exige donc un
   *    sommet d'où l'on peut partir ET où l'on peut revenir : une composante
   *    fortement connexe (Tarjan, itératif — la pile d'appels d'un iPad ne
   *    tient pas 400 000 niveaux de récursion).
   */
  private components(): Int32Array {
    if (this.component) return this.component
    const n = this.lat.length
    const index = new Int32Array(n).fill(-1)
    const low = new Int32Array(n)
    const onStack = new Uint8Array(n)
    const comp = new Int32Array(n).fill(-1)
    const stack: number[] = []
    const callNode: number[] = []
    const callEdge: number[] = []
    const size: number[] = []
    let counter = 0
    for (let root = 0; root < n; root++) {
      if (index[root] !== -1) continue
      callNode.push(root)
      callEdge.push(0)
      index[root] = low[root] = counter++
      stack.push(root)
      onStack[root] = 1
      while (callNode.length > 0) {
        const top = callNode.length - 1
        const v = callNode[top]
        const edges = this.out[v]
        if (callEdge[top] < edges.length) {
          const w = this.eTo[edges[callEdge[top]]]
          callEdge[top] += 1
          if (index[w] === -1) {
            index[w] = low[w] = counter++
            stack.push(w)
            onStack[w] = 1
            callNode.push(w)
            callEdge.push(0)
          } else if (onStack[w] && index[w] < low[v]) {
            low[v] = index[w]
          }
          continue
        }
        if (low[v] === index[v]) {
          const id = size.length
          let count = 0
          for (;;) {
            const w = stack.pop() as number
            onStack[w] = 0
            comp[w] = id
            count += 1
            if (w === v) break
          }
          size.push(count)
        }
        callNode.pop()
        callEdge.pop()
        if (callNode.length > 0) {
          const parent = callNode[callNode.length - 1]
          if (low[v] < low[parent]) low[parent] = low[v]
        }
      }
    }
    this.component = comp
    this.componentSize = size
    return comp
  }

  /** Taille de la composante d'un sommet. */
  componentOf(node: number): { id: number; size: number } {
    const comp = this.components()
    return { id: comp[node], size: this.componentSize[comp[node]] }
  }

  // -------------------------------------------------------------------------
  // Rattacher un point — AI2.5
  // -------------------------------------------------------------------------

  /**
   * L'arête la plus proche d'un point, en préférant le RÉSEAU au bout de
   * piste isolé.
   *
   * ⚠️ LA PLUS PROCHE N'EST PAS TOUJOURS LA BONNE. Un tronçon de piste de
   *    300 m que la carte ne relie à rien est souvent plus près d'une ferme
   *    que la route qui la dessert ; s'y rattacher donnerait « aucun chemin ».
   *    On retient donc l'arête la plus proche dont les DEUX bouts sont dans
   *    une même composante fortement connexe d'au moins `minComponent`
   *    sommets — d'où l'on peut partir et où l'on peut arriver — et on dit la
   *    distance réelle.
   */
  snap(point: LatLng, minComponent = 200): Snap | null {
    const comp = this.components()
    let best = null as Snap | null
    let bestLoose = null as Snap | null
    const lat0 = point.lat
    const kx = RAD * Math.cos(lat0 * RAD) * R
    const ky = RAD * R
    const ci = Math.floor(point.lat / CELL_DEG)
    const cj = Math.floor((point.lng + 180) / CELL_DEG)
    const maxRing = Math.ceil(MAX_SNAP_METERS / (CELL_DEG * ky)) + 1
    const seen = new Set<number>()
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let i = ci - ring; i <= ci + ring; i++) {
        for (let j = cj - ring; j <= cj + ring; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue
          const list = this.cells.get(i * 1e6 + j)
          if (!list) continue
          for (const e of list) {
            if (seen.has(e)) continue
            seen.add(e)
            const a = this.eFrom[e]
            const b = this.eTo[e]
            const ax = (this.lng[a] - point.lng) * kx
            const ay = (this.lat[a] - lat0) * ky
            const bx = (this.lng[b] - point.lng) * kx
            const by = (this.lat[b] - lat0) * ky
            const dx = bx - ax
            const dy = by - ay
            const len2 = dx * dx + dy * dy
            const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
            const px = ax + t * dx
            const py = ay + t * dy
            const meters = Math.sqrt(px * px + py * py)
            const candidate: Snap = {
              edge: e,
              t,
              meters,
              point: { lat: lat0 + py / ky, lng: point.lng + px / kx },
            }
            if (!bestLoose || meters < bestLoose.meters) bestLoose = candidate
            if (
              comp[a] === comp[b] &&
              this.componentSize[comp[a]] >= minComponent &&
              (!best || meters < best.meters)
            ) {
              best = candidate
            }
          }
        }
      }
      /* Une case de plus ne peut rapprocher qu'à (ring × 250 m) près : dès que
         le meilleur est plus près que l'anneau parcouru, on s'arrête. */
      const reach = ring * CELL_DEG * ky * Math.cos(lat0 * RAD)
      if (best && best.meters < reach) break
      if (reach > MAX_SNAP_METERS) break
    }
    if (best && best.meters <= MAX_SNAP_METERS) return best
    if (bestLoose && bestLoose.meters <= MAX_SNAP_METERS) return bestLoose
    return null
  }

  // -------------------------------------------------------------------------
  // Le plus court chemin en temps — A*
  // -------------------------------------------------------------------------

  /**
   * Du point rattaché `from` au point rattaché `to`. `null` quand aucun chemin
   * n'existe dans ce que le graphe contient (AI2.6 : l'appelant se replie).
   */
  shortestPath(from: Snap, to: Snap): RoadPath | null {
    const n = this.lat.length
    const TARGET = n
    const g = new Float64Array(n + 1).fill(Infinity)
    const prevEdge = new Int32Array(n + 1).fill(-1)
    const done = new Uint8Array(n + 1)
    const heap = new MinHeap()

    const targetLat = to.point.lat
    const targetLng = to.point.lng
    const hFactor = 3600 / (MAX_SPEED_KMH * 1000)
    const h = (node: number) =>
      metersBetween(this.lat[node], this.lng[node], targetLat, targetLng) * hFactor

    // Les arcs d'entrée dans le graphe : du point rattaché vers les deux bouts
    // de son arête — l'arête `from.edge` va de `eFrom` à `eTo`.
    const fe = from.edge
    const startArcs: Array<[number, number]> = [[this.eTo[fe], (1 - from.t) * this.eSeconds[fe]]]
    const reverse = this.reverseOf(fe)
    if (reverse !== -1) startArcs.push([this.eFrom[fe], from.t * this.eSeconds[fe]])

    // Les arcs de sortie : des bouts de l'arête `to.edge` vers le point.
    const te = to.edge
    const endArcs = new Map<number, number>()
    endArcs.set(this.eFrom[te], to.t * this.eSeconds[te])
    if (this.reverseOf(te) !== -1) endArcs.set(this.eTo[te], (1 - to.t) * this.eSeconds[te])

    // Même arête, dans le bon sens : le chemin direct le long de l'arête.
    let direct = Infinity
    if (fe === te && to.t >= from.t) direct = (to.t - from.t) * this.eSeconds[fe]
    else if (fe === te && reverse !== -1) direct = (from.t - to.t) * this.eSeconds[fe]
    if (direct < Infinity) {
      g[TARGET] = direct
      heap.push(TARGET, direct)
    }

    for (const [node, cost] of startArcs) {
      if (cost < g[node]) {
        g[node] = cost
        prevEdge[node] = -2 // entrée depuis le point de départ
        heap.push(node, cost + h(node))
      }
    }

    let found = false
    while (heap.size > 0) {
      const u = heap.pop()
      if (done[u]) continue
      done[u] = 1
      if (u === TARGET) {
        found = true
        break
      }
      const tail = endArcs.get(u)
      if (tail !== undefined && g[u] + tail < g[TARGET]) {
        g[TARGET] = g[u] + tail
        prevEdge[TARGET] = u // le sommet d'où l'on quitte le graphe
        heap.push(TARGET, g[TARGET])
      }
      for (const e of this.out[u]) {
        const v = this.eTo[e]
        if (done[v]) continue
        const cost = g[u] + this.eSeconds[e]
        if (cost < g[v]) {
          g[v] = cost
          prevEdge[v] = e
          heap.push(v, cost + h(v))
        }
      }
    }
    if (!found) return null

    // Reconstruction.
    const coords: LatLng[] = [to.point]
    let meters = 0
    let trackMeters = 0
    const exit = prevEdge[TARGET]
    if (exit === -1) {
      // Chemin direct sur la même arête.
      meters = Math.abs(to.t - from.t) * this.eMeters[fe]
      coords.push(from.point)
    } else {
      meters += exit === this.eFrom[te] ? to.t * this.eMeters[te] : (1 - to.t) * this.eMeters[te]
      let v = exit
      coords.push({ lat: this.lat[v], lng: this.lng[v] })
      while (prevEdge[v] >= 0) {
        const e = prevEdge[v]
        meters += this.eMeters[e]
        if (this.eSpeed[e] <= SPEED_TRACK_KMH) trackMeters += this.eMeters[e]
        v = this.eFrom[e]
        coords.push({ lat: this.lat[v], lng: this.lng[v] })
      }
      meters += v === this.eTo[fe] ? (1 - from.t) * this.eMeters[fe] : from.t * this.eMeters[fe]
      coords.push(from.point)
    }
    coords.reverse()
    return { coords, meters, seconds: g[TARGET], trackMeters }
  }

  /** L'arête opposée d'une arête à double sens, ou -1 pour un sens unique. */
  private reverseOf(e: number): number {
    const a = this.eFrom[e]
    const b = this.eTo[e]
    for (const candidate of this.out[b]) if (this.eTo[candidate] === a) return candidate
    return -1
  }
}

export interface Snap {
  edge: number
  /** Position le long de l'arête, 0 = `eFrom`, 1 = `eTo`. */
  t: number
  /** Distance du point collé à la route. */
  meters: number
  /** Le point de la route où l'on se rattache. */
  point: LatLng
}

export interface RoadPath {
  coords: LatLng[]
  meters: number
  seconds: number
  /** La part du trajet en piste ou en voie de service lente. */
  trackMeters: number
}

/**
 * Liang–Barsky : le segment recoupé au carré [0, E]. Le cinquième élément dit
 * si le PREMIER point était déjà dans la tuile, ce qui permet de réutiliser
 * le sommet précédent au lieu d'en fabriquer un autre au même endroit.
 */
function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  E: number,
): [number, number, number, number, boolean] | null {
  const dx = x1 - x0
  const dy = y1 - y0
  let t0 = 0
  let t1 = 1
  const p = [-dx, dx, -dy, dy]
  const q = [x0, E - x0, y0, E - y0]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) {
        if (r > t1) return null
        if (r > t0) t0 = r
      } else {
        if (r < t0) return null
        if (r < t1) t1 = r
      }
    }
  }
  if (t1 - t0 <= 0) return null
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy, t0 === 0]
}

/** Tas binaire minimal sur (sommet, priorité). */
class MinHeap {
  private ids: number[] = []
  private keys: number[] = []

  get size(): number {
    return this.ids.length
  }

  push(id: number, key: number): void {
    const ids = this.ids
    const keys = this.keys
    let i = ids.length
    ids.push(id)
    keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p] <= key) break
      ids[i] = ids[p]
      keys[i] = keys[p]
      i = p
    }
    ids[i] = id
    keys[i] = key
  }

  pop(): number {
    const ids = this.ids
    const keys = this.keys
    const top = ids[0]
    const lastId = ids.pop() as number
    const lastKey = keys.pop() as number
    const n = ids.length
    if (n > 0) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        if (l >= n) break
        const r = l + 1
        const c = r < n && keys[r] < keys[l] ? r : l
        if (keys[c] >= lastKey) break
        ids[i] = ids[c]
        keys[i] = keys[c]
        i = c
      }
      ids[i] = lastId
      keys[i] = lastKey
    }
    return top
  }
}

// ---------------------------------------------------------------------------
// Les tuiles à charger pour un trajet
// ---------------------------------------------------------------------------

/** Le zoom des tuiles lues : le plus fin de l'archive, le seul qui porte les pistes. */
export const ROAD_ZOOM = 14

/**
 * ★ LE COULOIR D'UN TRAJET. Le plus court chemin sort souvent de la ligne
 *   droite — c'est précisément le wadi qu'on contourne. On charge donc une
 *   BANDE autour du segment, de demi-largeur 15 % de sa longueur et jamais
 *   moins de 2,5 km ; une étape sans chemin est retentée avec une bande
 *   élargie (`widen`) avant le repli.
 *
 * ⚠️ UNE BANDE ET NON LE RECTANGLE DES DEUX EXTRÉMITÉS, ET LA MESURE L'A
 *    DEMANDÉ : Jérusalem → Lakhish en diagonale, le rectangle élargi faisait
 *    ~470 tuiles, et une tournée de huit étapes en lisait 623 au premier
 *    calcul — 3,5 s. La bande n'en prend que ce qui borde le trajet.
 */
export const CORRIDOR_RATIO = 0.15
export const CORRIDOR_MIN_METERS = 2_500

export function corridorTiles(a: LatLng, b: LatLng, widen = 1): Array<[number, number, number]> {
  const len = metersBetween(a.lat, a.lng, b.lat, b.lng)
  const half = Math.max(CORRIDOR_MIN_METERS, len * CORRIDOR_RATIO) * widen
  const midLat = (a.lat + b.lat) / 2
  const kx = RAD * R * Math.cos(midLat * RAD)
  const ky = RAD * R
  const dLat = half / ky
  const dLng = half / kx
  const z = ROAD_ZOOM
  const x0 = lngToTileX(Math.min(a.lng, b.lng) - dLng, z)
  const x1 = lngToTileX(Math.max(a.lng, b.lng) + dLng, z)
  const y0 = latToTileY(Math.max(a.lat, b.lat) + dLat, z)
  const y1 = latToTileY(Math.min(a.lat, b.lat) - dLat, z)
  // Le segment, en mètres locaux autour de `a`.
  const bx = (b.lng - a.lng) * kx
  const by = (b.lat - a.lat) * ky
  const len2 = bx * bx + by * by
  const out: Array<[number, number, number]> = []
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const west = tileToLng(x, z)
      const east = tileToLng(x + 1, z)
      const north = tileToLat(y, z)
      const south = tileToLat(y + 1, z)
      const cx = ((west + east) / 2 - a.lng) * kx
      const cy = ((north + south) / 2 - a.lat) * ky
      const halfDiag = Math.hypot((east - west) * kx, (north - south) * ky) / 2
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (cx * bx + cy * by) / len2))
      const d = Math.hypot(cx - t * bx, cy - t * by)
      if (d <= half + halfDiag) out.push([z, x, y])
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// AI2.4 · AI2.5 · AI2.6 — une étape du trajet
// ---------------------------------------------------------------------------

export type LegMode = 'road' | 'straight'

export interface RoadLeg {
  mode: LegMode
  /** Le tracé sur route, du point de rattachement au point de rattachement. */
  coords: LatLng[]
  /** Les deux bouts hors réseau, en pointillé. Vides quand le point est sur la route. */
  gaps: Array<[LatLng, LatLng]>
  meters: number
  seconds: number
  /** Mètres hors réseau, aux deux bouts. */
  gapMeters: number
  trackMeters: number
}

const offroadSeconds = (meters: number): number =>
  (meters * OFFROAD_DETOUR) / ((SPEED_OFFROAD_KMH * 1000) / 3600)

/**
 * Une étape entre deux points DÉJÀ rattachés. Le repli à vol d'oiseau est
 * l'affaire de l'appelant, qui connaît l'estimation d'AH9 ; ici on ne rend
 * que ce que la route sait dire, ou `null`.
 */
export function roadLeg(
  graph: RoadGraph,
  from: LatLng,
  to: LatLng,
  fromSnap: Snap,
  toSnap: Snap,
): RoadLeg | null {
  const path = graph.shortestPath(fromSnap, toSnap)
  if (!path) return null
  const gaps: Array<[LatLng, LatLng]> = []
  let gapMeters = 0
  if (fromSnap.meters > 1) {
    gaps.push([from, fromSnap.point])
    gapMeters += fromSnap.meters
  }
  if (toSnap.meters > 1) {
    gaps.push([toSnap.point, to])
    gapMeters += toSnap.meters
  }
  return {
    mode: 'road',
    coords: path.coords,
    gaps,
    meters: path.meters + gapMeters * OFFROAD_DETOUR,
    seconds: path.seconds + offroadSeconds(gapMeters),
    gapMeters,
    trackMeters: path.trackMeters,
  }
}
