import { useTranslation } from 'react-i18next'

import { Icon } from '../components/Icon'
import { ScrollRow } from '../components/primitives'

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
      className="mt-10 scroll-mt-[var(--shell-top)] border-b border-edge-subtle pb-1.5
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
 */
export function SettingsToc() {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('settings.group.toc')}
      data-testid="settings-toc"
      className="mt-4 rounded-card border border-edge-subtle bg-surface-high p-3"
    >
      {/* ⚠️ UNE SEULE LIGNE QUI DÉFILE, ET `bun run layout` EST POURQUOI. Sept
          pastilles qui se replient sur trois lignes à 390 px ont poussé cet
          écran de 5,2 à 6,0 hauteurs d'écran, c'est-à-dire exactement le
          plafond d'A30 — un sommaire qui coûte un tiers d'écran au sommet
          d'une page qu'il sert à raccourcir se paie deux fois. */}
      <p className="label mb-2">{t('settings.group.toc')}</p>
      <ScrollRow>
        {SETTINGS_GROUPS.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`settings-toc-${id}`}
            className="filter-pill"
            onClick={() => {
              document
                .getElementById(anchorId(id))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            {t(`settings.group.${id}`)}
            <Icon name="chevronDown" size={11} />
          </button>
        ))}
      </ScrollRow>
    </nav>
  )
}
