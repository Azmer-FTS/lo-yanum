import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  getSession,
  homeRouteFor,
  listSessionPresets,
  presetIdOf,
  presetToSession,
  resetStore,
  setSession,
} from '@core/index'
import type { Role } from '@core/index'

import { SUPABASE_CONFIGURED } from '../../data/config'
import { useCoreValue } from '../hooks/useCore'
import { EMERGENCY_ROUTE } from './EmergencyButton'
import { Icon } from './Icon'

const ROLE_ORDER: Role[] = ['coordinator', 'farmer', 'volunteer', 'driver']

/**
 * ★★ Z6 (2026-09-07) — ON A PHONE THIS BAR IS IN THE WAY OF THE APP IT IS
 *    THERE TO SHOW.
 *
 * "Sur smartphone, le sélecteur de rôle gêne pour juger vraiment de l'app. La
 *  bascule se replie derrière un bouton discret dans un coin de l'écran; un
 *  tap l'ouvre. Sur tablette et desktop, elle reste comme aujourd'hui."
 *
 * At 402 px the bar is a select, two buttons and a label that wrap onto two
 * lines and take 62 px off a 874 px screen — permanently, on every screen,
 * under the content the product owner is trying to judge. Folded, it is a
 * 44 px disc in the corner the map controls do not use and `--shell-foot`
 * goes back to zero, which hands those 62 px to the app.
 *
 * ⚠️ THE QUESTION IS THE VIEWPORT'S, NOT A PANEL'S, and that is the one place
 *    in this app where it is. This bar is pinned to the bottom of the DEVICE;
 *    it is not in a column anybody drags. `useNarrow` would be measuring the
 *    wrong box on purpose.
 */
const PHONE = '(max-width: 639px)'

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(PHONE)
    const onChange = (e: MediaQueryListEvent) => setPhone(e.matches)
    mq.addEventListener('change', onChange)
    setPhone(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return phone
}

/**
 * POC-only role switcher. Deleted in Lot 1 together with @core/sessions —
 * nothing else in the app imports either.
 */
export function DevToolbar() {
  /**
   * P2.3 — GONE IN A REAL BUILD. This bar hands out farmer, volunteer and
   * driver sessions on mock people; behind a real login that is not a
   * convenience, it is a way to be someone else. The flag is a build-time
   * constant, so returning before the hooks can never change their order — and
   * `--shell-foot` is published by the sticky container in `layouts.tsx`, and
   * that container is not rendered in a real build either.
   */
  if (SUPABASE_CONFIGURED) return null

  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const presets = useCoreValue(listSessionPresets)
  const session = useCoreValue(getSession)
  const currentId = presetIdOf(session)
  const phone = useIsPhone()
  const [open, setOpen] = useState(false)

  /**
   * ⚠️ PO POINT 1 — THIS BAR NO LONGER PUBLISHES `--shell-foot`, AND THE
   *   REASON IS A DEFECT THE GATE FOUND THE MOMENT IT COULD SEE IT.
   *
   *   It published its own height, which was right for as long as it was the
   *   only thing pinned at the foot of the shell. In `FieldLayout` it is not:
   *   the tab bar and this bar share ONE sticky container, so the shell
   *   claimed 69 px while 131 px was occupied, and 62 px of every full-`dvh`
   *   column sat behind the tab bar. The CONTAINER measures itself now
   *   (`layouts.tsx`, `usePublishedHeight(footRef, '--shell-foot')`), which
   *   includes whatever it comes to hold rather than whatever somebody
   *   remembered to add up.
   */

  const onPick = (id: string) => {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    setSession(presetToSession(preset))
    navigate(homeRouteFor(preset.role))
  }

  // Not sticky itself: the layouts decide where the bar sits, so it can share a
  // single sticky container with the field tab bar instead of the two fighting
  // over `bottom-0`.
  //
  // PO return 6 — the home-indicator inset is PADDING ON THIS BAR so its
  // SURFACE runs under the indicator rather than stopping above it. The
  // measurement that matters is now the sticky container's (PO point 1), and
  // this padding is inside that container, so it is still counted.
  const picker = (
    <>
        <select
          value={currentId}
          onChange={(e) => onPick(e.target.value)}
          aria-label={t('devbar.viewAs')}
          className="min-w-0 flex-1 rounded-field border border-edge-strong bg-surface-raised px-3 py-1.5 text-caption
                     text-content-primary transition-colors duration-fast focus:border-accent focus:outline-none sm:min-w-64 sm:flex-none"
        >
          {ROLE_ORDER.map((role) => {
            const group = presets.filter((p) => p.role === role)
            if (group.length === 0) return null
            return (
              <optgroup key={role} label={t(`roles.${role}`)}>
                {group.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name
                      ? `${p.name}${p.detail ? ` · ${p.detail}` : ''}`
                      : t(`roles.${role}`)}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>

        <button
          type="button"
          onClick={() => {
            resetStore()
            navigate(homeRouteFor(getSession().role))
          }}
          className="rounded-field px-2.5 py-1.5 text-micro text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
        >
          {t('devbar.reset')}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-field px-2.5 py-1.5 text-micro text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
        >
          {t('devbar.backToLogin')}
        </button>

        <span className="ms-auto hidden text-micro text-content-muted/60 lg:block">
          {t('devbar.hint')}
        </span>
    </>
  )

  /**
   * ★ Z6.1 — THE PHONE READING: a disc in the corner, and a sheet above it.
   *
   * The corner is the bottom INLINE START, which in this Hebrew app is the
   * physical right — the one the map controls leave empty. The "+" is pinned
   * to `end-[var(--map-rail)]` (physical left) and the mode pill extends from
   * it, so the two never meet; and the offset is `--shell-foot` plus the
   * same reserve those two use, so on a field shell the disc sits above the
   * tab bar rather than on it.
   *
   * ⚠️ AND IT RENDERS NOTHING IN FLOW, which is the point: the sticky
   *    container in `layouts.tsx` measures itself, so an empty one publishes
   *    no `--shell-foot` at all and the 62 px go back to the app.
   */
  /**
   * ★★ AE2 / A124 — ET IL NE SE DESSINE PAS SUR L'ÉCRAN D'URGENCE.
   *
   * Le disque de démonstration est posé au coin bas du DÉBUT de ligne, qui sur
   * l'écran d'urgence est occupé par des numéros de 64 px. `bun run aeui` l'a
   * mesuré : deux cibles couvertes à 402 px, et les cibles couvertes étaient
   * des numéros d'urgence. C'est A86 exactement, dans le seul écran où il
   * coûte une intervention. Le « + » du coordinateur y avait déjà été retiré
   * pour la même raison (`layouts.tsx`) ; celui-ci le suit.
   */
  if (pathname === EMERGENCY_ROUTE) return null

  if (phone) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('devbar.viewAs')}
          title={t('devbar.viewAs')}
          data-testid="devbar-toggle"
          /* ⚠️ `--pinned-foot` IS THE THIRD TERM, AND `bun run layout` IS WHY.
             A screen that owns the bottom of the device — the guard wizard,
             every form — pins its own action bar there, and the sweep caught
             this disc lying on it at 402 px on all four wizard steps. The bar
             publishes its measured height (standing decision 39: measured, not
             declared) and the disc starts above it. Zero everywhere else. */
          className="glass fixed bottom-[calc(var(--shell-foot)+var(--pinned-foot,0px)+var(--shell-bottom)+1.25rem)]
                     start-[var(--map-rail)] z-40 flex h-11 w-11 items-center justify-center
                     rounded-pill text-content-secondary shadow-card"
        >
          <Icon name="switch" size={18} />
        </button>
        {open && (
          <div
            role="dialog"
            aria-label={t('devbar.viewAs')}
            data-testid="devbar-panel"
            /* ★★ AE2 — SIX REM ET NON QUATRE ET DEMI, ET `bun run layout` EST
               POURQUOI. Le disque fait 44 px depuis 1,25 rem, donc 4,5 rem le
               dégageait ; le bouton d'urgence de la coquille de terrain en
               fait 64 (AE2b.4 : « vise plus large que le minimum ») et son
               sommet est à 5,25 rem. Ce panneau se posait dessus sur les six
               écrans de terrain — c'est-à-dire un objet de DÉMONSTRATION
               couvrant le contrôle d'urgence, le défaut A86 dans le seul
               écran où il coûte une intervention. C'est le panneau qui monte :
               entre un artefact du jumeau et le bouton rouge, ce n'est pas le
               bouton rouge qui se déplace. */
            className="glass fixed bottom-[calc(var(--shell-foot)+var(--pinned-foot,0px)+var(--shell-bottom)+6rem)]
                       start-[var(--map-rail)] end-[var(--map-rail)] z-40 flex flex-wrap items-center
                       gap-x-3 gap-y-2 rounded-card p-3 shadow-lift"
          >
            <span className="flex w-full items-center gap-1.5 text-micro font-medium text-content-muted">
              <Icon name="switch" size={14} />
              {t('devbar.viewAs')}
            </span>
            {picker}
          </div>
        )}
      </>
    )
  }

  return (
    <div
      className="border-t border-edge-strong bg-surface-sunken pb-[var(--safe-bottom)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <span className="flex items-center gap-1.5 text-micro font-medium text-content-muted">
          <Icon name="switch" size={14} />
          {t('devbar.viewAs')}
        </span>
        {picker}
      </div>
    </div>
  )
}
