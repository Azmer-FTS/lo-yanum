import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { effectiveAreas, entityKindOf, farmPoint, formatDate, nearestLocalities, totalHeads } from '@core/index'
import type { Farm } from '@core/index'

import { Avatar } from './Avatar'
import { FarmStatusChip } from './badges'
import { ChevronForward, Icon } from './Icon'
import type { IconName } from './Icon'
import { useLocale } from '../hooks/useLocale'

/**
 * U8 (2026-09-02) — ONE QUICK CARD FOR AN ENTITY, REUSED IN TWO PLACES.
 *
 * The map's selected-marker card and the list's hover / long-press preview
 * are the same object to the coordinator — "the essentials of this farm,
 * without leaving where I am" — so they are the same component. Six figures
 * (farm dunams, grazing dunams, heads, status, next visit, posts), the
 * photo, and the one way in.
 */
export function EntityQuickCard({
  farm,
  posts,
  onClose,
  compact = false,
  situate = false,
}: {
  farm: Farm
  /** Number of guard posts, when the caller knows it. */
  posts?: number
  onClose?: () => void
  /** The list preview: no close button, denser. */
  compact?: boolean
  /**
   * ★★ AU1.3 (2026-10-08) — LA BULLE DE LA CARTE, QUI DOIT SITUER LE LIEU.
   * « Trop petite sur ordinateur : agrandis-la pour qu'on situe le lieu d'un
   * coup d'œil. » 20 rem sur un écran de 1 440 px, c'était une étiquette. Dès
   * `lg` elle passe à 28 rem, photo et nom plus grands, et une ligne « où »
   * dit la localité et, faute de יישוב, la localité connue la plus proche
   * avec sa distance — le PO lit « à 4 km de נתיבות », pas des coordonnées.
   */
  situate?: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const heads = totalHeads(farm)
  const moshav = entityKindOf(farm) === 'moshav'
  const point = situate ? farmPoint(farm) : null
  const near = point ? nearestLocalities(point, 1)[0] : undefined
  const where = farm.locality
    ? `${farm.locality} · ${farm.region}`
    : near
      ? t('map.nearLocality', { name: near.locality.name, km: near.km.toFixed(near.km < 10 ? 1 : 0) })
      : t('farms.noPosition')

  const figure = (icon: IconName, value: ReactNode, label: string, tone = '') => (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`shrink-0 ${tone || 'text-content-muted'}`}>
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="numeric block truncate text-caption font-bold text-content-primary">
          {value}
        </span>
        <span className="block truncate text-micro text-content-muted">{label}</span>
      </span>
    </div>
  )

  return (
    <div
      data-testid="entity-quick-card"
      data-situate={situate ? '' : undefined}
      className={`animate-fade-in rounded-card bg-surface-overlay/95 shadow-lift backdrop-blur ${
        compact ? 'p-3' : 'p-4'
      } ${situate ? 'w-[min(20rem,calc(100vw-2rem))] lg:w-[28rem] lg:p-5' : ''}`}
    >
      <div className="flex items-start gap-3">
        {situate ? (
          <>
            <span className="lg:hidden">
              <Avatar photo={farm.photo} name={farm.name} size="lg" shape="square" />
            </span>
            <span className="hidden lg:block">
              <Avatar photo={farm.photo} name={farm.name} size="xl" shape="square" />
            </span>
          </>
        ) : (
          <Avatar photo={farm.photo} name={farm.name} size={compact ? 'md' : 'lg'} shape="square" />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-heading text-content-primary ${situate ? 'lg:whitespace-normal lg:text-title' : ''}`}
            title={farm.name}
          >
            {farm.name}
          </p>
          {situate && (
            <p
              data-testid="quick-card-where"
              className="mt-1 flex items-center gap-1.5 text-caption font-semibold text-content-primary lg:text-body"
            >
              <span className="shrink-0 text-accent-ink">
                <Icon name="pin" size={16} />
              </span>
              <span className="min-w-0 truncate">{where}</span>
            </p>
          )}
          {!situate && (
            <p className="muted mt-0.5 truncate" title={`${farm.locality} · ${farm.region}`}>
              {farm.locality} · {farm.region}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <FarmStatusChip status={farm.status} />
            <span className="chip bg-surface-high text-content-secondary">
              {t(`farmType.${farm.type}`)}
            </span>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 rounded-field p-1 text-content-muted hover:bg-surface-high hover:text-content-primary"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-edge-subtle pt-3">
        {figure(
          'landPlot',
          t('farms.kpiDunams', { n: effectiveAreas(farm).cultivated.toLocaleString(locale) }),
          t(moshav ? 'farms.farmAreaMoshav' : 'farms.farmArea'),
          'text-status-success-ink',
        )}
        {figure(
          'wheat',
          t('farms.kpiDunams', { n: farm.grazingDunams.toLocaleString(locale) }),
          t('farms.grazingArea'),
          'text-accent-ink',
        )}
        {heads !== null &&
          figure('pawPrint', heads.toLocaleString(locale), t('livestock.total'), 'text-status-warn-ink')}
        {figure(
          'calendar',
          farm.nextVisitAt ? (
            <span className="ltr-nums">{formatDate(farm.nextVisitAt, locale)}</span>
          ) : (
            t('farms.noVisitYet')
          ),
          t('farms.nextVisit'),
          'text-status-violet-ink',
        )}
        {posts !== undefined &&
          figure('pin', t('blocks.posts', { count: posts }), t('farms.anchorPoints'), 'text-status-info-ink')}
      </div>

      {!compact && (
        <Link to={`/coordinator/farms/${farm.id}`} className="btn-primary mt-3 w-full">
          {t('map.openFarm')}
          <ChevronForward size={16} />
        </Link>
      )}
    </div>
  )
}

/**
 * U8 — HOVER (mouse) OR LONG-PRESS (touch) OPENS A PREVIEW BESIDE THE TILE.
 *
 * The card is rendered through a portal at a FIXED position computed from
 * the tile's rectangle, because the list panel scrolls (`overflow-y: auto`
 * clips on both axes) and its `.panel-scope` wrapper is a containing block
 * for `fixed` descendants. Below the tile when there is room, above it
 * otherwise; never past the viewport's inline edges.
 *
 * A long-press that opened the preview swallows the click that would follow
 * on release, so a held finger does not also open the file.
 */
export function useQuickPreview<T extends { id: string }>() {
  const [preview, setPreview] = useState<{ item: T; rect: DOMRect } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const swallowClick = useRef(false)
  const hoverTimer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(hoverTimer.current)
    },
    [],
  )

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    window.clearTimeout(hoverTimer.current)
    setPreview(null)
  }, [])

  // Any scroll or tap elsewhere closes the preview.
  useEffect(() => {
    if (!preview) return
    const off = () => close()
    window.addEventListener('scroll', off, true)
    window.addEventListener('pointerdown', off, true)
    window.addEventListener('keydown', off)
    return () => {
      window.removeEventListener('scroll', off, true)
      window.removeEventListener('pointerdown', off, true)
      window.removeEventListener('keydown', off)
    }
  }, [preview, close])

  const bind = (item: T) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = window.setTimeout(() => setPreview({ item, rect }), 350)
    },
    onMouseLeave: () => {
      window.clearTimeout(hoverTimer.current)
      setPreview((p) => (p?.item.id === item.id ? null : p))
    },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') return
      const rect = e.currentTarget.getBoundingClientRect()
      swallowClick.current = false
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        swallowClick.current = true
        setPreview({ item, rect })
      }, 450)
    },
    onPointerUp: () => window.clearTimeout(timer.current),
    onPointerMove: () => window.clearTimeout(timer.current),
    onPointerCancel: () => window.clearTimeout(timer.current),
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (swallowClick.current) {
        swallowClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
  })

  const portal = (render: (item: T) => ReactNode) => {
    if (!preview) return null
    const { rect } = preview
    const width = Math.min(320, window.innerWidth - 16)
    const below = rect.bottom + 8
    const spaceBelow = window.innerHeight - below
    const top = spaceBelow > 260 ? below : Math.max(8, rect.top - 8 - 260)
    // Inline placement: aligned with the tile's start edge, kept on screen.
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
    return createPortal(
      <div
        data-overlay=""
        data-testid="quick-preview"
        style={{ position: 'fixed', top, left, width, zIndex: 60 }}
        className="pointer-events-none"
      >
        {render(preview.item)}
      </div>,
      document.body,
    )
  }

  return { preview, bind, portal, close }
}
