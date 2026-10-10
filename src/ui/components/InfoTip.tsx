import type { ReactNode } from 'react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AX4 (2026-10-10) — L'INFORMATION SECONDAIRE SE RANGE, ET D'UNE SEULE FAÇON.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Il y a trop d'explications un peu de partout, au-dessus, en dessous. »
 * L'inventaire en a compté ~290 paragraphes « muted », 110 clés `*Hint`, 15
 * sous-titres qui expliquent — tous ouverts, tout le temps.
 *
 * LA FORME : un ⓘ discret à côté de ce qu'il explique ; le toucher OUVRE, SUR
 * PLACE, un panneau sous la ligne, qui se referme par le même ⓘ ou par sa ×.
 *
 * ⚠️ POURQUOI PAS UNE BULLE (le PO a demandé qu'on réfléchisse, pas qu'on
 *    exécute) :
 *    - une bulle flotte AU-DESSUS de ce qu'on lit : elle cache la liste
 *      qu'elle explique, et sur l'iPad, près d'un bord ou en RTL, elle se fait
 *      couper (mesuré en AQ4 : le panneau de recherche passait sous le rail) ;
 *    - au toucher, une bulle n'a pas de « survol » : elle s'ouvre au doigt et
 *      se ferme… où ? Le PO cherchait déjà une croix ;
 *    - un panneau en place se lit PENDANT qu'on travaille, pousse le contenu
 *      au lieu de le cacher, et la × du PO y est naturelle.
 * ⚠️ POURQUOI PAS UN DÉPLIANT « en savoir plus » : un libellé de plus, en
 *    toutes lettres, sur chaque écran — c'est le bruit qu'on retire.
 *
 * ⛔ FERMÉ PAR DÉFAUT, ET JAMAIS RETENU OUVERT : rien n'est déployé d'avance
 *    (AX10.4). L'ESSENTIEL ne passe pas par ici : il reste visible, en une
 *    ligne (AX4.2).
 *
 * Trois façons de le poser, UN composant :
 *   - `<InfoTip>…</InfoTip>` seul : le ⓘ, puis le panneau sous lui ;
 *   - `useInfoTip(contenu)` → `{ button, panel }` quand le ⓘ va à côté d'un
 *     titre et le panneau sous la rangée (PageHeader, ListTop, Section, Field).
 */
export function useInfoTip(content: ReactNode | undefined, opts: { label?: string; testId?: string } = {}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const id = useId()
  if (content === undefined || content === null || content === '' || content === false) return { button: null, panel: null, open: false }
  const label = opts.label ?? t('info.more')
  const button = (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOpen((v) => !v)
      }}
      aria-expanded={open}
      aria-controls={id}
      aria-label={label}
      title={label}
      data-info-toggle=""
      data-testid={opts.testId ? `${opts.testId}-toggle` : undefined}
      /* 44 px de cible pour 20 px de dessin : discret à l'œil, facile au doigt. */
      className={`-my-2 inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-pill align-middle transition-colors duration-fast ${
        open ? 'text-accent-ink' : 'text-content-muted hover:text-content-primary'
      }`}
    >
      <Icon name="info" size={18} />
    </button>
  )
  const panel = open ? (
    <div
      id={id}
      role="note"
      data-info-panel=""
      data-testid={opts.testId}
      className="relative mt-2 max-w-prose rounded-field border border-edge-subtle bg-surface-high px-3 py-2.5 pe-10 text-caption leading-relaxed text-content-secondary animate-fade-in"
    >
      {content}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
        }}
        aria-label={t('common.close')}
        data-info-close=""
        className="absolute end-1 top-1 flex h-9 w-9 items-center justify-center rounded-pill text-content-muted hover:bg-surface-raised hover:text-content-primary"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  ) : null
  return { button, panel, open }
}

export function InfoTip({ children, label, testId, className = '' }: { children: ReactNode; label?: string; testId?: string; className?: string }) {
  const { button, panel } = useInfoTip(children, { label, testId })
  return (
    <div className={className} data-info="">
      {button}
      {panel}
    </div>
  )
}

/**
 * Une ligne d'aide ATTACHÉE à un titre : le titre, son ⓘ, puis le panneau.
 * Pour les en-têtes faits main qui ne passent pas par `PageHeader`/`Section`.
 */
export function TitleWithInfo({ children, info, testId, as: Tag = 'span', className = '' }: { children: ReactNode; info?: ReactNode; testId?: string; as?: 'span' | 'h2' | 'h3' | 'p'; className?: string }) {
  const { button, panel } = useInfoTip(info, { testId })
  return (
    <>
      <Tag className={`inline-flex items-center gap-0.5 ${className}`}>
        {children}
        {button}
      </Tag>
      {panel}
    </>
  )
}
