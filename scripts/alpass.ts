import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  ASSOCIATION_COLUMNS,
  analyseAssociation,
  analyseProspection,
  applyAssociation,
  applyProspection,
  associationExportMatrix,
  associationInputs,
  createFarm,
  getFarm,
  getFarmsForImport,
  getVisibleFarms,
  guardedDunamsOf,
  guardedIsManual,
  resetStore,
  suggestedGuardedDunams,
  updateFarm,
  HOME_BASE,
} from '../src/core/index'
import type { Farm } from '../src/core/index'
import { matrixToCsv } from '../src/core/xlsx'
import he from '../src/locales/he.json'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AL — LA PASSE DE FINITION, SANS NAVIGATEUR. A207 · A208 · A209
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run alpass
 *
 *   A207  « שטחים שמירה » : la somme est PROPOSÉE et jamais écrite ; un geste
 *         l'accepte ; une valeur acceptée n'est plus jamais recalculée ni
 *         écrasée ; sans geste, la colonne sort VIDE.
 *   A208  les quinze fiches d'AK1 sont inchangées — ce que la BASE a rendu.
 *   A209  aucun fond « relief » n'a été ajouté à la carte.
 *
 * ⚠️ LE GESTE LUI-MÊME (le bouton, la ligne qui s'efface) est mesuré dans un
 *    navigateur par `bun run alui` : une règle pure ne peut pas voir un doigt.
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

const draftOf = (farm: Farm) => {
  const { id: _id, lastVisitAt: _l, nextVisitAt: _n, ...rest } = farm
  return rest
}

// ---------------------------------------------------------------------------
section('A207 — « שטחים שמירה » se propose, elle ne se remplit plus seule')
// ---------------------------------------------------------------------------
{
  /* 1 — LA SOMME EST CONNUE, ET ELLE N'EST PAS LA VALEUR. */
  const areas = { farmDunams: 100, grazingDunams: 1000 }
  check('A207 · l\'app SAIT proposer la somme מעובד + מרעה',
    suggestedGuardedDunams(areas) === 1100, String(suggestedGuardedDunams(areas)))
  check('A207 · et la colonne, elle, reste VIDE tant que rien n\'a été accepté',
    guardedDunamsOf(areas) === null, JSON.stringify(guardedDunamsOf(areas)))
  check('A207 · une fiche sans aucune surface ne propose RIEN (pas de drapeau sur un zéro)',
    suggestedGuardedDunams({ farmDunams: 0, grazingDunams: 0 }) === null)
  check('A207 · la suggestion suit la surface mesurée quand rien n\'est déclaré',
    suggestedGuardedDunams({ measuredFarmDunams: 40, measuredGrazingDunams: 60 }) === 100)

  /* 2 — LE GESTE. Ce que le formulaire écrit quand le bouton est touché. */
  const accepted = { farmDunams: 100, grazingDunams: 1000, guardedDunams: 1100, guardedDunamsManual: true }
  check('A207 · un geste l\'accepte : la valeur devient celle du PO', guardedDunamsOf(accepted) === 1100)
  check('A207 · et elle est marquée comme SIENNE, pas comme un calcul', guardedIsManual(accepted))

  /* 3 — UNE VALEUR ACCEPTÉE N'EST PLUS JAMAIS RECALCULÉE NI ÉCRASÉE. */
  const moved = { ...accepted, farmDunams: 700, grazingDunams: 4000 }
  check('A207 · les surfaces changent, la surface gardée NE BOUGE PAS',
    guardedDunamsOf(moved) === 1100, String(guardedDunamsOf(moved)))
  check('A207 · même quand la nouvelle somme vaut autre chose',
    suggestedGuardedDunams(moved) === 4700 && guardedDunamsOf(moved) === 1100)
  const typedOther = { farmDunams: 100, grazingDunams: 1000, guardedDunams: 250, guardedDunamsManual: true }
  check('A207 · un chiffre AUTRE que la somme est gardé tel quel', guardedDunamsOf(typedOther) === 250)
  check('A207 · un zéro tapé ne fige pas la fiche (le piège d\'AA4 tient toujours)',
    guardedDunamsOf({ farmDunams: 100, grazingDunams: 1000, guardedDunams: 0, guardedDunamsManual: false }) === null)

  /* 4 — SANS GESTE, LA COLONNE SORT VIDE DU FICHIER TRANSMIS. */
  resetStore()
  const base = getVisibleFarms()[0]
  const silent = createFarm({ ...draftOf(base), name: 'ללא מחווה', farmDunams: 100, grazingDunams: 1000, guardedDunams: undefined, guardedDunamsManual: undefined })
  const withGesture = createFarm({ ...draftOf(base), name: 'עם מחווה', farmDunams: 100, grazingDunams: 1000, guardedDunams: 1100, guardedDunamsManual: true })
  const rows = [getFarm(silent.id)!, getFarm(withGesture.id)!]
  const { matrix } = associationExportMatrix(associationInputs(rows))
  const iGuard = matrix[0].indexOf('שטחים שמירה')
  check('A207 · sans geste la case du fichier est VIDE', matrix[1][iGuard] === '', `«${matrix[1][iGuard]}»`)
  check('A207 · avec le geste elle porte 1100', matrix[2][iGuard] === '1100', `«${matrix[2][iGuard]}»`)
  const csv = matrixToCsv(matrix)
  check('A207 · et les octets du CSV disent la même chose', csv.includes(',,') || csv.includes(';;') || matrix[1][iGuard] === '')

  /* 5 — L'ALLER-RETOUR NE FABRIQUE PAS DE VALEUR. */
  resetStore()
  const fresh = getVisibleFarms().find((f) => f.name === 'ללא מחווה') ?? null
  const blank = createFarm({ ...draftOf(getVisibleFarms()[0]), name: 'הלוך ושוב', farmDunams: 100, grazingDunams: 1000, guardedDunams: undefined, guardedDunamsManual: undefined })
  const out = associationExportMatrix(associationInputs([getFarm(blank.id)!])).matrix
  const read = analyseAssociation(out[0], out.slice(1), getFarmsForImport())
  applyAssociation(read.plan, new Map(), 'al.csv', HOME_BASE)
  check('A207 · export → ré-import : toujours rien de déclaré',
    guardedDunamsOf(getFarm(blank.id)!) === null && fresh === null,
    JSON.stringify(guardedDunamsOf(getFarm(blank.id)!)))
  check('A207 · et le drapeau n\'a pas été posé en chemin', getFarm(blank.id)!.guardedDunamsManual !== true)

  /* 6 — UN CHIFFRE VENU D'UN FICHIER EST UNE DÉCLARATION, ELLE, ET ELLE TIENT. */
  const declaredOut = out.map((r) => [...r])
  declaredOut[1][iGuard] = '900'
  const read2 = analyseAssociation(declaredOut[0], declaredOut.slice(1), getFarmsForImport())
  applyAssociation(read2.plan, new Map(), 'al2.csv', HOME_BASE)
  check('A207 · un fichier qui DÉCLARE 900 l\'écrit, et c\'est un geste aussi',
    guardedDunamsOf(getFarm(blank.id)!) === 900, String(guardedDunamsOf(getFarm(blank.id)!)))
  updateFarm(blank.id, { farmDunams: 7, grazingDunams: 7 })
  check('A207 · et 900 survit à un changement de surfaces', guardedDunamsOf(getFarm(blank.id)!) === 900)

  /**
   * 6bis — ET LA VALEUR ACCEPTÉE SURVIT À UN ALLER-RETOUR PAR LEUR FICHIER.
   *
   * ⚠️ TROUVÉ PAR CETTE PORTE, CORRIGÉ DANS `association.ts` : la colonne
   *    SORTAIT et ne RENTRAIT pas. Le PO acceptait la somme, exportait, et le
   *    fichier relu ne portait plus sa déclaration. C'est la « perte » qu'AB6.7
   *    promet d'éviter, restée ouverte parce qu'aucune porte ne la cherchait.
   */
  resetStore()
  const kept = createFarm({ ...draftOf(getVisibleFarms()[0]), name: 'ערך שהתקבל', farmDunams: 100, grazingDunams: 1000, guardedDunams: 1100, guardedDunamsManual: true })
  const sent = associationExportMatrix(associationInputs([getFarm(kept.id)!])).matrix
  check('A207 · le fichier transmis porte 1100', sent[1][sent[0].indexOf('שטחים שמירה')] === '1100')
  resetStore()
  const again = getVisibleFarms().find((f) => f.name === 'ערך שהתקבל')
  const back = analyseAssociation(sent[0], sent.slice(1), getFarmsForImport())
  applyAssociation(back.plan, new Map(), 'al3.csv', HOME_BASE)
  const landed = getVisibleFarms().find((f) => f.name === 'ערך שהתקבל')
  check('A207 · ré-importé, 1100 est TOUJOURS là (rien de perdu en chemin)',
    again === undefined && landed !== undefined && guardedDunamsOf(landed!) === 1100,
    landed ? String(guardedDunamsOf(landed)) : 'fiche absente')

  /* 7 — LES MOTS QUE LE PO VOIT EXISTENT, ET NE PROMETTENT PAS UN REMPLISSAGE. */
  const form = he.form as Record<string, string>
  check('A207 · le bouton a un nom : « להשתמש בסכום השטחים »',
    form.guardedSuggest === 'להשתמש בסכום השטחים', form.guardedSuggest)
  check('A207 · la ligne dit d\'où vient le chiffre', typeof form.guardedSuggestHint === 'string' && form.guardedSuggestHint.includes('מעובד'))
  check('A207 · et l\'aide du champ dit que l\'app PROPOSE', form.guardedAreaHint.includes('מציעה'))
  check('A207 · les libellés du défaut d\'AC3 ont disparu de la traduction',
    form.guardedAuto === undefined && form.guardedBackToDefault === undefined)

  /**
   * 8 — AUCUN AUTRE CHEMIN N'ÉCRIT CETTE COLONNE.
   *
   * ⚠️ C'est la porte qui compte, pas la promesse : un défaut recopié revient
   *    par une ligne de code, pas par une intention. Trois endroits POSENT le
   *    drapeau, et chacun est un geste : le formulaire (le bouton ou la
   *    frappe), l'import de prospection, l'import du fichier de l'association.
   */
  const writers: string[] = []
  /* Ce qui est ÉCARTÉ, et pourquoi : une déclaration de type, une LECTURE du
     drapeau, la traduction d'une ligne de base (`data/rows.ts`), un simple
     relais (`store.ts`) et une valeur de jeu d'essai. Ce qui reste est une
     décision de poser le drapeau. */
  const NOT_A_WRITE = [
    /guardedDunamsManual\?:/,
    /guardedDunamsManual === true/,
    /(farm|existing\??)\.guardedDunamsManual/,
    /guarded_dunams_manual/,
    /guardedDunamsManual: patch\.guardedDunamsManual/,
    /guardedDunamsManual: false/,
  ]
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(full)) {
        /* ⚠️ LES COMMENTAIRES SONT RETIRÉS D'ABORD, et c'est ce qui manquait à
           la première version de cette porte : dans ce dépôt un commentaire de
           bloc fait douze lignes et ses lignes du milieu ne commencent pas
           par une étoile. La porte comptait une PHRASE comme une écriture. */
        const source = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        for (const line of source.split('\n')) {
          const code = line.trim()
          if (!code.includes('guardedDunamsManual')) continue
          if (NOT_A_WRITE.some((re) => re.test(code))) continue
          writers.push(`${full}|${code}`)
        }
      }
    }
  }
  walk('src')
  const files = [...new Set(writers.map((w) => w.split('|')[0]))]
  check('A207 · TROIS fichiers seulement posent le drapeau, et chacun est un geste',
    files.length === 3 &&
      files.some((f) => f.endsWith('prospection.ts')) &&
      files.some((f) => f.endsWith('association.ts')) &&
      files.some((f) => f.endsWith('FarmFormScreen.tsx')),
    files.join(' · '))
  check('A207 · le formulaire ne le pose JAMAIS sur une case vide ni sur un zéro',
    writers.some((w) => w.includes('FarmFormScreen.tsx') &&
      /guardedDunamsManual:\s*guardedManual && num\(guardedDunams\) > 0/.test(w)),
    writers.filter((w) => w.includes('FarmFormScreen')).map((w) => w.split('|')[1]).join(' · '))
}

// ---------------------------------------------------------------------------
section('A208 — les quinze fiches d\'AK1 sont inchangées')
// ---------------------------------------------------------------------------
{
  const rows = JSON.parse(readFileSync('docs/ak/ak1-prod-rows.json', 'utf8')) as Array<Record<string, unknown>>
  check('A208 · les quinze sont là, et seulement elles', rows.length === 15, String(rows.length))
  check('A208 · leurs identifiants sont farm-ak1-01 … -15',
    rows.every((r, i) => r.id === `farm-ak1-${String(i + 1).padStart(2, '0')}`))
  const guarded = rows.filter((r) => r.guarded_dunams !== null && r.guarded_dunams !== undefined)
  check('A208 · AUCUNE ne porte de surface gardée — AL1 n\'a rien écrit pour le PO',
    guarded.length === 0, guarded.map((r) => `${r.id}=${r.guarded_dunams}`).join(' · '))
  check('A208 · et aucune n\'est marquée « déclarée »',
    rows.every((r) => r.guarded_dunams_manual !== true))
  /* Ce qu'AK1 a mesuré, recompté ici : rien d'AL ne l'a bougé. */
  const positioned = rows.filter((r) => r.position_missing !== true)
  check('A208 · six sont sur la carte, neuf n\'ont pas de position', positioned.length === 6, String(positioned.length))
  const weighted = rows.reduce((sum, r) => {
    const c = Number(r.farm_dunams ?? 0)
    const g = Number(r.grazing_dunams ?? 0)
    return sum + Math.round(c * 1 + g * 0.02)
  }, 0)
  check('A208 · la somme pondérée est toujours 2 160 dounams', weighted === 2160, String(weighted))
  const ids = rows.map((r) => r.id)
  check('A208 · pas de doublon', new Set(ids).size === 15)
  const margi = rows.find((r) => r.name === 'חוות מרגי')
  check('A208 · le ת״ז de חוות מרגי garde son zéro', margi?.farmer_id_no === '021985189', String(margi?.farmer_id_no))
}

// ---------------------------------------------------------------------------
section('A209 — aucun fond relief n\'a été ajouté')
// ---------------------------------------------------------------------------
{
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(tsx?|css|json)$/.test(full)) files.push(full)
    }
  }
  walk('src')
  const base = readFileSync('src/ui/components/basemap.ts', 'utf8')
  check('A209 · le type du fond porte DEUX valeurs, vector et satellite',
    /export type BasemapBase = 'vector' \| 'satellite'/.test(base))
  const words = ['hillshade', 'terrain-rgb', 'terrarium', 'demSource', 'raster-dem']
  const hits: string[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const w of words) if (text.includes(w)) hits.push(`${file}: ${w}`)
  }
  check('A209 · aucune source d\'élévation, aucun ombrage de relief dans le code',
    hits.length === 0, hits.join(' · '))
  /* Le mot « relief » peut apparaître dans un commentaire qui explique le
     refus ; ce qui est interdit est un TROISIÈME fond, pas le mot. */
  const bases = [...base.matchAll(/base === '([a-z]+)'/g)].map((m) => m[1])
  check('A209 · et rien dans la carte ne se compare à un troisième fond',
    bases.every((b) => b === 'vector' || b === 'satellite'), [...new Set(bases)].join(' · '))
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
