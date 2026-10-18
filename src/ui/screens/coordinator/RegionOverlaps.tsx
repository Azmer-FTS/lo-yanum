import type maplibregl from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { shapeRings } from '@core/index'
import type { LatLng, PlannedStep, Region } from '@core/index'

import { Icon } from '../../components/Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BL (3.3) — LES RECOUVREMENTS ENTRE RÉGIONS, MONTRÉS AVANT D'ÊTRE RÉSOLUS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Entre elles, il ne faut pas qu'il y ait de superposition. »   — le PO
 *
 * ★ JAMAIS AUTOMATIQUE. Rien ne se résout au chargement : c'est une action que
 *   le PO déclenche (« חפיפות בין אזורים »), et rien n'est enregistré tant qu'il
 *   n'a pas appuyé sur « החלה ושמירה ».
 * ★ CHAQUE CONFLIT EST MONTRÉ : les deux régions, la surface en litige (sur
 *   terre), à qui elle irait, et ce que perdrait l'autre — ou pourquoi on ne
 *   peut pas (elle serait coupée en deux, percée, presque effacée). Sur la
 *   carte, le terrain disputé est HACHURÉ, et le nouveau bord du perdant tracé
 *   en pointillés.
 * ★ LA RÈGLE EST ÉCRITE dans le panneau, en une phrase (`core/topology.ts`,
 *   `winnerOf`), et sa raison en dessous.
 * ★ LE PO PEUT REFUSER un partage (« אכריע בעצמי ») : les deux régions restent
 *   telles quelles, il ajustera la frontière à la main.
 * ★ ET IL PEUT REVENIR EN ARRIÈRE : « ביטול הפתרון » remet chaque région
 *   touchée comme elle était (une région jamais redessinée redevient celle
 *   d'origine).
 */

export interface OverlapsPanelProps {
  regions: readonly Region[]
  steps: PlannedStep[]
  refused: ReadonlySet<string>
  focus: string | null
  onFocus: (key: string) => void
  onToggle: (key: string) => void
  onApply: () => void
  onClose: () => void
  /** La dernière résolution appliquée, réversible tant que l'écran est ouvert. */
  canRevert: boolean
  onRevert: () => void
  done: string | null
}

export function OverlapsPanel(p: OverlapsPanelProps) {
  const { t, i18n } = useTranslation()
  const name = (id: string) => p.regions.find((r) => r.id === id)?.name ?? id
  const rgb = (id: string) => p.regions.find((r) => r.id === id)?.rgb ?? '100 100 100'
  const fmt = (n: number) => Math.round(n).toLocaleString(i18n.language === 'he' ? 'he-IL' : i18n.language)
  const applicable = p.steps.filter((s) => s.result.ok && !p.refused.has(s.key))
  return (
    <div dir="rtl" data-testid="overlaps-panel" data-count={p.steps.length} className="pointer-events-auto flex w-full flex-col gap-2 rounded-card bg-surface-overlay px-3 py-2.5 shadow-card">
      <div className="flex items-center gap-2">
        <Icon name="overlaps" size={18} className="shrink-0 text-status-danger-ink" />
        <h2 className="min-w-0 flex-1 text-caption font-semibold text-content-primary">{t('regionEdit.overlapsTitle', { count: p.steps.length })}</h2>
        <button type="button" data-testid="overlaps-close" className="btn-secondary min-h-11 py-1.5 text-micro" onClick={p.onClose}>
          {t('common.close')}
        </button>
      </div>
      <p data-testid="overlaps-rule" className="text-caption font-semibold text-content-primary">
        {t('regionEdit.rule')}
      </p>
      <p className="text-micro text-content-muted">{t('regionEdit.ruleWhy')}</p>
      {p.done && (
        <p role="status" data-testid="overlaps-done" className="text-micro font-semibold text-status-success-ink">
          {p.done}
        </p>
      )}
      {p.steps.length === 0 ? (
        <p data-testid="overlaps-none" className="text-caption text-content-secondary">
          {t('regionEdit.overlapsNone')}
        </p>
      ) : (
        <ul className="flex max-h-[26dvh] flex-col gap-1.5 overflow-y-auto" data-testid="overlaps-list">
          {p.steps.map((s) => {
            const refused = p.refused.has(s.key)
            const ok = s.result.ok
            return (
              <li
                key={s.key}
                data-testid={`overlap-${s.key}`}
                data-winner={s.winner}
                data-loser={s.loser}
                data-ok={ok ? '1' : '0'}
                data-refused={refused ? '1' : '0'}
                data-dunams={Math.round(s.dunams)}
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card px-2.5 py-2 ${p.focus === s.key ? 'bg-surface-high ring-2 ring-accent' : 'bg-surface-high'}`}
              >
                <button type="button" data-testid={`overlap-focus-${s.key}`} className="flex min-h-11 min-w-0 flex-1 flex-col items-start gap-0.5 text-start" onClick={() => p.onFocus(s.key)}>
                  <span className="flex items-center gap-1.5 text-caption font-semibold text-content-primary">
                    <span className="h-2.5 w-2.5 rounded-pill" style={{ background: `rgb(${rgb(s.a)})` }} />
                    {name(s.a)}
                    <span className="text-content-muted">↔</span>
                    <span className="h-2.5 w-2.5 rounded-pill" style={{ background: `rgb(${rgb(s.b)})` }} />
                    {name(s.b)}
                    <bdi className="numeric text-micro font-normal text-content-muted">{t('regionEdit.disputed', { n: fmt(s.dunams) })}</bdi>
                  </span>
                  <span className="text-micro text-content-secondary">
                    {ok
                      ? t('regionEdit.goesTo', { winner: name(s.winner), loser: name(s.loser), n: fmt((s.result as { lostDunams: number }).lostDunams) })
                      : t('regionEdit.cannot', { loser: name(s.loser), why: t(`editor.pushWhy.${(s.result as { reason: string }).reason}`) })}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid={`overlap-toggle-${s.key}`}
                  aria-pressed={!refused && ok}
                  disabled={!ok}
                  className={`min-h-11 shrink-0 py-1.5 text-micro ${!refused && ok ? 'btn-primary' : 'btn-secondary'} disabled:opacity-40`}
                  onClick={() => p.onToggle(s.key)}
                >
                  {ok && !refused && <Icon name="check" size={13} />}
                  {!ok ? t('regionEdit.manualOnly') : refused ? t('regionEdit.refused') : t('regionEdit.accepted')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="overlaps-apply" className="btn-primary min-h-11 py-1.5 text-micro disabled:opacity-40" disabled={applicable.length === 0} onClick={p.onApply}>
          <Icon name="check" size={13} />
          {t('regionEdit.apply', { count: applicable.length })}
        </button>
        {p.canRevert && (
          <button type="button" data-testid="overlaps-revert" className="btn-secondary min-h-11 py-1.5 text-micro" onClick={p.onRevert}>
            <Icon name="undo" size={13} />
            {t('regionEdit.revert')}
          </button>
        )}
        <span className="text-micro text-content-muted">{t('regionEdit.nothingSaved')}</span>
      </div>
    </div>
  )
}

/** Sur la carte : le terrain disputé hachuré, et le nouveau bord de chaque perdant en pointillés. */
export function OverlapsOverlay({ map, steps, refused, focus, regions }: { map: maplibregl.Map | null; steps: PlannedStep[]; refused: ReadonlySet<string>; focus: string | null; regions: readonly Region[] }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!map) return
    const el = document.createElement('div')
    el.setAttribute('data-testid', 'overlaps-overlay')
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;'
    map.getContainer().appendChild(el)
    setHost(el)
    let frame = 0
    const repaint = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setTick((n) => n + 1)
      })
    }
    map.on('move', repaint)
    map.on('resize', repaint)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      map.off('move', repaint)
      map.off('resize', repaint)
      el.remove()
      setHost(null)
    }
  }, [map])
  if (!host || !map) return null
  const d = (ring: LatLng[]) => `M${ring.map((p) => map.project([p.lng, p.lat])).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join('L')}Z`
  const rgb = (id: string) => regions.find((r) => r.id === id)?.rgb ?? '100 100 100'
  return createPortal(
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
      <defs>
        <pattern id="bl-overlap-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="rgba(220,38,38,0.18)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#dc2626" strokeWidth="2.2" />
        </pattern>
      </defs>
      {steps.map((s) => (
        <g key={s.key} data-testid={`overlap-area-${s.key}`} opacity={focus && focus !== s.key ? 0.45 : 1}>
          {shapeRings(s.shape).map((r, k) => (
            <path key={k} d={d(r)} fill="url(#bl-overlap-hatch)" stroke="#dc2626" strokeWidth={focus === s.key ? 2.5 : 1.2} />
          ))}
          {s.result.ok && !refused.has(s.key) && focus === s.key && (
            /* Le conflit choisi : le nouveau bord du perdant, s'il est appliqué. */
            <path data-testid={`overlap-result-${s.key}`} d={d(s.result.ring)} fill="none" stroke={`rgb(${rgb(s.loser)})`} strokeWidth={2.5} strokeDasharray="7 5" />
          )}
        </g>
      ))}
    </svg>,
    host,
  )
}
