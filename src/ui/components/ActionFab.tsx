import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * W4 (2026-09-02) — ONE "+" FOR THE WHOLE COORDINATOR SHELL.
 * ★★ AB1 (2026-09-08) — AND IT ONLY OFFERS WHAT THIS SCREEN CAN CREATE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ WHAT WAS WRONG BEFORE W4. "Create" was five different affordances in five
 *   places: a floating circle on three routes below `lg`, a `btn-primary` in
 *   the farms header, another in the volunteers header, another in the drivers
 *   header, a fourth on the dashboard and a fifth on the agenda — each with
 *   its own icon, its own size and its own breakpoint rule.
 *
 * ★★ WHAT WAS STILL WRONG, AND IT IS THE PRODUCT OWNER'S OWN SENTENCE:
 *
 *      « je suis sur l'agenda et il me propose d'ajouter une ferme,
 *        ce n'est pas bon. »
 *
 *    W4 sorted the four actions so that the current screen's came FIRST, and
 *    kept the other three under a hairline "in case". That is a menu that
 *    answers a question nobody asked: nothing on the agenda is a farm, and a
 *    list that offers a farm there is a list the coordinator has to READ
 *    before he can act. So the menu is now the screen's own creations and
 *    NOTHING ELSE — `CREATIONS` below is that table, one row per screen.
 *
 * ★ AND WHEN THERE IS ONLY ONE, THE BUTTON IS THAT ONE. « Un menu à un seul
 *   choix est un clic perdu » — on מתנדבים, נהגים, שמירות, אירועים and מסלול
 *   the "+" opens the thing directly, with no intermediate panel to dismiss.
 *   The dashboard is the one screen that offers everything, because it is the
 *   home screen and is about no single object.
 *
 * ⚠️ WHY THE PHYSICAL LEFT AND NOT THE RAIL'S SIDE. `end-4` is the inline
 *    end, which in this Hebrew app is the physical LEFT; the icon rail is at
 *    the inline START, i.e. the physical right. A fixed corner on the rail's
 *    side sits on the rail past `lg`. The map's mode pill shares this corner
 *    and is RAISED above the button (see `MapModePill.raised`).
 *
 * ⚠️ AND `--shell-bottom` RATHER THAN A NUMBER: it is the real height of
 *    whatever is pinned to the foot of the shell (the demo toolbar, or a bare
 *    home-indicator inset in a real build).
 */

interface FabAction {
  key: string
  /**
   * Where it goes.
   *
   * ⚠️ SEVERAL OF THESE ARE QUERY STRINGS ON THE SCREEN'S OWN ROUTE — `?new=1`
   *    on the two rosters, `?new=visit` on the agenda, `?new=step` on the
   *    planner. Those creations open a modal or a block that the SCREEN owns,
   *    so the menu cannot call their setter from out here; it asks through the
   *    URL, which works from any route, and the screen reads the parameter and
   *    clears it. A shared React state would need a store nobody else wants.
   */
  to: string
  labelKey: string
  icon: IconName
  testId?: string
}

const NEW_FARM: FabAction = {
  key: 'farm',
  to: '/coordinator/farms/new',
  labelKey: 'farms.new',
  icon: 'farm',
  testId: 'fab-farm-new',
}

/** G16 — the same form, opened on the other entity kind. */
const NEW_MOSHAV: FabAction = {
  key: 'moshav',
  to: '/coordinator/farms/new?kind=moshav',
  labelKey: 'farms.newMoshav',
  icon: 'home',
  testId: 'fab-moshav-new',
}

const NEW_VOLUNTEER: FabAction = {
  key: 'volunteer',
  to: '/coordinator/volunteers?new=1',
  labelKey: 'volunteers.new',
  icon: 'userPlus',
  testId: 'volunteer-new',
}

const NEW_DRIVER: FabAction = {
  key: 'driver',
  to: '/coordinator/drivers?new=1',
  labelKey: 'driver.addDriver',
  icon: 'steering',
  testId: 'driver-new',
}

const NEW_MISSION: FabAction = {
  key: 'mission',
  to: '/coordinator/missions/new',
  labelKey: 'missions.create',
  icon: 'shield',
  testId: 'fab-mission-new',
}

/** AB1 — אירועים: the coordinator files one himself, from his own desk. */
const NEW_INCIDENT: FabAction = {
  key: 'incident',
  to: '/coordinator/incidents?new=1',
  labelKey: 'incidents.new',
  icon: 'alert',
  testId: 'fab-incident-new',
}

/** The two kinds of appointment the diary holds: a farm visit and a meeting. */
const NEW_VISIT: FabAction = {
  key: 'visit',
  to: '/coordinator/agenda?new=visit',
  labelKey: 'agenda.planVisit',
  icon: 'pin',
  testId: 'fab-visit-new',
}

const NEW_MEETING: FabAction = {
  key: 'meeting',
  to: '/coordinator/agenda?new=meeting',
  labelKey: 'meeting.new',
  icon: 'users',
  testId: 'fab-meeting-new',
}

/** AB1 — מסלול: a step is a farm added to the day, not a new record. */
const NEW_STEP: FabAction = {
  key: 'step',
  to: '/coordinator/route?new=step',
  labelKey: 'route.newStep',
  icon: 'route',
  testId: 'fab-step-new',
}

/**
 * ★★ AB1.1 — WHAT EACH SCREEN CAN CREATE, AND NOTHING ELSE.
 *
 * The product owner's own list, transcribed:
 *
 *   חוות / מושבים  → nouvelle ferme, nouveau moshav
 *   מתנדבים        → nouveau volontaire
 *   נהגים מתנדבים  → nouveau conducteur
 *   שמירות         → nouvelle garde
 *   אירועים        → nouvel événement
 *   יומן           → nouveau rendez-vous, nouvelle garde
 *   מסלול          → nouvelle étape
 *   לוח בקרה       → l'ensemble, c'est l'écran d'accueil
 *
 * ⚠️ « NOUVEAU RENDEZ-VOUS » IS TWO ROWS HERE AND THAT IS DELIBERATE. This
 *    diary holds two kinds of appointment — a farm visit (ביקור) and a general
 *    meeting (פגישה) — and they are different records with different modals.
 *    Collapsing them into one row would either drop one of them from the
 *    agenda, which is a feature removed, or make the coordinator choose again
 *    on the next screen, which is the intermediate click AB1.2 exists to kill.
 *
 * ★ AND THE KEYS OF THIS TABLE ARE THE ROUTES THE BUTTON EXISTS ON. There is
 *   no second list to keep in step: a screen that creates nothing has no "+".
 */
const CREATIONS: Record<string, readonly FabAction[]> = {
  // לוח בקרה — the home screen, about no single object, so it offers all.
  '/coordinator': [
    NEW_FARM,
    NEW_MOSHAV,
    NEW_VOLUNTEER,
    NEW_DRIVER,
    NEW_MISSION,
    NEW_VISIT,
    NEW_MEETING,
    NEW_INCIDENT,
  ],
  '/coordinator/farms': [NEW_FARM, NEW_MOSHAV],
  '/coordinator/volunteers': [NEW_VOLUNTEER],
  '/coordinator/drivers': [NEW_DRIVER],
  '/coordinator/missions': [NEW_MISSION],
  '/coordinator/incidents': [NEW_INCIDENT],
  '/coordinator/agenda': [NEW_VISIT, NEW_MEETING, NEW_MISSION],
  '/coordinator/route': [NEW_STEP],
}

/** Where the button belongs. Elsewhere (forms, wizards) it would be noise. */
export const FAB_ROUTES = Object.keys(CREATIONS)

export function ActionFab() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const actions = CREATIONS[pathname]
  if (!actions || actions.length === 0) return null

  /** AB1.2 — one possible creation is not a choice; it is the button itself. */
  const only = actions.length === 1 ? actions[0] : null

  const item = (action: FabAction, primary: boolean) => (
    <button
      key={action.key}
      type="button"
      data-testid={action.testId}
      data-fab-item={action.key}
      onClick={() => {
        setOpen(false)
        navigate(action.to)
      }}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-start text-caption
                  transition-colors duration-fast ${
                    primary
                      ? 'bg-accent font-semibold text-content-on-accent shadow-accent'
                      : 'text-content-primary hover:bg-surface-high'
                  }`}
    >
      <Icon name={action.icon} size={17} />
      <span className="truncate">{t(action.labelKey)}</span>
    </button>
  )

  return (
    <div
      ref={ref}
      data-testid="action-fab"
      data-open={open ? '1' : '0'}
      data-fab-count={actions.length}
      /* ⚠️ `data-overlay` — THE SAME DECLARATION THE MODE PILL CARRIES, and
         for the same reason. The `layout` gate forbids two pinned elements
         from overlapping, because two bars that found each other by accident
         is a defect; a floating action button is over the panel underneath
         BY CONSTRUCTION, and it is also not "occupied foot" the shell has to
         reserve room for. */
      data-overlay=""
      /* ★ AA1.2 — AND IT IS PART OF THE BOTTOM RAIL, which steps aside while
         the phone's filter panel is open. See `[data-bottom-rail]` in
         `index.css`: this button was measured sitting ON TOP of the last
         filter pill on מתנדבים at 402 px, which made that filter untappable.
         ★★ AB1.4 — `bun run pills` now walks that question on all nine
         screens (A86), not only on the one where it was found. */
      data-bottom-rail=""
      /* X3.1 — THE SAME AXIS AS THE MAP RAIL. */
      className="fixed bottom-[calc(var(--shell-bottom)+1.25rem)] end-[var(--map-rail)] z-40 flex flex-col items-end"
    >
      {open && !only && (
        <div
          role="menu"
          aria-label={t('fab.menu')}
          data-testid="action-fab-menu"
          className="glass mb-2 flex w-60 animate-fade-in flex-col gap-0.5 rounded-card p-1.5 shadow-lift"
        >
          <span className="px-2.5 pb-1 pt-1 text-micro font-semibold text-content-muted">
            {t('fab.menu')}
          </span>
          {actions.map((action, i) => item(action, i === 0))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (only) navigate(only.to)
          else setOpen((v) => !v)
        }}
        aria-expanded={only ? undefined : open}
        aria-haspopup={only ? undefined : 'menu'}
        aria-label={only ? t(only.labelKey) : t(open ? 'fab.close' : 'fab.open')}
        title={only ? t(only.labelKey) : t('fab.open')}
        data-testid="action-fab-toggle"
        data-fab-direct={only ? only.key : undefined}
        className={`flex h-[var(--map-rail-w)] w-[var(--map-rail-w)] items-center justify-center rounded-pill shadow-accent
                    transition-all duration-base ease-out active:scale-95 ${
                      open && !only
                        ? 'bg-surface-overlay text-content-primary'
                        : 'bg-gradient-accent text-content-on-accent'
                    }`}
      >
        <Icon name={open && !only ? 'close' : 'plus'} size={23} />
      </button>
    </div>
  )
}
