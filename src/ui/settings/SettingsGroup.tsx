import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScrollRow } from '../components/primitives'
import { usePublishedHeight } from '../hooks/useShellMetrics'

/**
 * ★★ AF7 (2026-09-09) — LES SEPT SECTIONS, ET LEUR SOMMAIRE.
 *
 * Le brief donne les sept noms et l'ordre ; ils sont ici et nulle part
 * ailleurs, de sorte que le sommaire et les en-têtes ne puissent pas diverger
 * — c'est la même liste qui produit les deux.
 */
export const SETTINGS_GROUPS = [
  'profile',
  'target',
  'thresholds',
  'templates',
  'map',
  'display',
  'data',
] as const

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]

const anchorId = (id: SettingsGroupId): string => `settings-group-${id}`

/**
 * L'en-tête d'un groupe. Il ne CONTIENT rien — les blocs restent des frères,
 * exactement là où ils étaient dans l'arbre, avec leurs `collapseKey` et leur
 * état replié intacts. Un regroupement qui les aurait imbriqués aurait changé
 * un comportement, ce qu'AF7 interdit explicitement.
 */
export function SettingsGroup({ id }: { id: SettingsGroupId }) {
  const { t } = useTranslation()
  return (
    <h2
      id={anchorId(id)}
      data-settings-group={id}
      /* AI7 — le défilement s'arrête SOUS la barre épinglée, pas derrière. */
      className="mt-10 scroll-mt-[calc(var(--shell-top,0px)+var(--settings-toc-h,3rem)+0.5rem)] border-b border-edge-subtle pb-1.5
                 text-caption font-semibold uppercase tracking-wide text-content-muted
                 first:mt-6"
    >
      {t(`settings.group.${id}`)}
    </h2>
  )
}

/**
 * ⚠️ IL DÉFILE, IL NE NAVIGUE PAS. Un `<a href="#settings-group-map">` dans
 *    une application qui ROUTE sur le hachage (`HashRouter`) remplace la route
 *    par « /settings-group-map » et vide l'écran. Le sommaire appelle donc
 *    `scrollIntoView`, ce qui marche aussi bien quand la colonne de contenu
 *    est son propre conteneur de défilement, ce qu'elle est au-dessus du point
 *    de rupture (`MapSplit`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AI7 (2026-09-14) — ÉPINGLÉ, ET IL DIT OÙ L'ON EST.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO doit pouvoir sauter d'une section à l'autre sans remonter toute
 *     la page. Il indique la section en cours. »
 *
 * ★ LA MÊME MÉCANIQUE QUE LES EN-TÊTES DE LISTE : `.sticky-top` sous
 *   `--shell-top`, qui vaut la hauteur mesurée de la barre du téléphone et
 *   rien au-dessus du point de rupture, où la colonne défile seule. Un
 *   `sticky` en HAUT tient toute la page, puisque la page entière est son
 *   parent — le piège d'AH2 est au bas du contenu, pas en haut.
 *
 * ★ LA SECTION EN COURS EST LA DERNIÈRE DONT L'EN-TÊTE A PASSÉ SOUS LA BARRE.
 *   Mesurée au défilement (écouté en capture, donc aussi celui de la colonne),
 *   pas devinée au clic : le PO fait défiler au doigt bien plus souvent qu'il
 *   n'appuie sur le sommaire. En bas de page, là où les dernières sections
 *   n'ont plus de place pour monter jusqu'à la barre, c'est la dernière dont
 *   l'en-tête est à l'écran.
 */
export function SettingsToc() {
  const { t } = useTranslation()
  const navRef = useRef<HTMLElement | null>(null)
  const [active, setActive] = useState<SettingsGroupId>(SETTINGS_GROUPS[0])
  usePublishedHeight(navRef, '--settings-toc-h')

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const nav = navRef.current
      if (!nav) return
      const limit = nav.getBoundingClientRect().bottom + 16
      let current: SettingsGroupId = SETTINGS_GROUPS[0]
      for (const id of SETTINGS_GROUPS) {
        const el = document.getElementById(anchorId(id))
        if (el && el.getBoundingClientRect().top <= limit) current = id
      }
      const scroller = scrollParent(nav)
      const atEnd = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      if (atEnd) {
        const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight
        for (const id of SETTINGS_GROUPS) {
          const el = document.getElementById(anchorId(id))
          if (el && el.getBoundingClientRect().top < bottom - 40) current = id
        }
      }
      setActive(current)
    }
    const schedule = () => {
      /* setTimeout et non requestAnimationFrame : un onglet caché ne rend pas
         de trames (voir la mémoire du volet navigateur), et l'état doit être
         juste au retour. */
      if (frame === 0) frame = window.setTimeout(update, 50)
    }
    document.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      document.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      if (frame) window.clearTimeout(frame)
    }
  }, [])

  // La pastille active reste visible dans sa rangée, sans toucher au défilement vertical.
  useEffect(() => {
    const pill = navRef.current?.querySelector<HTMLElement>(`[data-testid="settings-toc-${active}"]`)
    const row = pill?.parentElement
    if (!pill || !row) return
    const p = pill.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    if (p.left < r.left || p.right > r.right) {
      row.scrollBy({ left: p.left < r.left ? p.left - r.left - 12 : p.right - r.right + 12, behavior: 'smooth' })
    }
  }, [active])

  return (
    <nav
      ref={navRef}
      aria-label={t('settings.group.toc')}
      data-testid="settings-toc"
      data-active={active}
      className="sticky-top mt-4 border-b border-edge-subtle py-2"
      style={{ top: 'var(--shell-top, 0px)' }}
    >
      {/* ⚠️ UNE SEULE LIGNE QUI DÉFILE, ET `bun run layout` EST POURQUOI. Sept
          pastilles qui se replient sur trois lignes à 390 px ont poussé cet
          écran de 5,2 à 6,0 hauteurs d'écran, c'est-à-dire exactement le
          plafond d'A30 — un sommaire qui coûte un tiers d'écran au sommet
          d'une page qu'il sert à raccourcir se paie deux fois. AI7 retire en
          plus la carte et son libellé : épinglée, la barre est sous les yeux
          en permanence, et chaque pixel qu'elle prend est pris à tout l'écran. */}
      <ScrollRow>
        {SETTINGS_GROUPS.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`settings-toc-${id}`}
            aria-current={active === id ? 'true' : undefined}
            className={`filter-pill ${active === id ? 'filter-pill-active' : ''}`}
            onClick={() => {
              setActive(id)
              document
                .getElementById(anchorId(id))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            {t(`settings.group.${id}`)}
          </button>
        ))}
      </ScrollRow>
    </nav>
  )
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}
