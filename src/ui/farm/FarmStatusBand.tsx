import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { FarmStatus } from '@core/index'

import { FarmStatusDot } from '../components/badges'
import { Icon } from '../components/Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BA (2026-10-12) — LES STATUTS SORTENT DE LA RANGÉE DES FILTRES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Le PO doit voir d'un coup d'œil ce qui est un statut et ce qui est un
 * filtre. » Les statuts ont donc LEUR rangée, d'une autre forme (segments
 * cerclés à pastille colorée, sur fond teinté), sur UNE ligne qui défile de
 * côté, épinglée « complètement à gauche » — le bout de la ligne en hébreu.
 *
 * Et dessous, LA LÉGENDE DES TROIS MARQUES qui suivent le nom d'une ferme.
 * Leur sens n'existait que dans une infobulle (`title`), qui n'existe pas au
 * doigt : chaque marque est ici un bouton de 44 px qui déplie sa phrase.
 *   ● le disque coloré   — le statut ;
 *   ○ l'anneau           — la ferme négligée : vide = jamais gardée,
 *                          rempli = gardée il y a longtemps ;
 *   ■ le carré           — l'écart entre surface déclarée et tracé.
 */
type MarkKey = 'status' | 'neglect' | 'gap'

export function FarmStatusBand({
  counts,
  value,
  onChange,
  neglectDays,
  gapPercent,
}: {
  counts: ReadonlyArray<{ status: FarmStatus; count: number }>
  value: FarmStatus | null
  onChange: (next: FarmStatus | null) => void
  neglectDays: number
  gapPercent: number
}) {
  const { t } = useTranslation()
  const total = counts.reduce((n, k) => n + k.count, 0)
  return (
    <div className="flex flex-col gap-1" data-testid="farm-status-band">
      <div className="flex min-w-0 items-center gap-2 rounded-card bg-surface-high/70 px-2 ring-1 ring-edge-subtle" data-testid="farm-status-row">
        <span className="shrink-0 text-micro font-semibold text-content-muted">{t('farmMarks.statusTitle')}</span>
        {/* `ms-auto` sur le premier segment : la rangée se cale sur la GAUCHE de l'écran (le bout de la ligne en hébreu) et reste défilable quand elle déborde — ce que `justify-end` ne permet pas. */}
        <div className="one-line-row min-w-0 flex-1 [&>:first-child]:ms-auto" role="radiogroup" aria-label={t('farmMarks.statusTitle')} data-testid="farm-status-chips">
          <StatusSegment active={value === null} onClick={() => onChange(null)} label={t('farms.statusAll')} count={total} testId="farm-status-all" />
          {counts.map((k) => (
            <StatusSegment
              key={k.status}
              active={value === k.status}
              onClick={() => onChange(value === k.status ? null : k.status)}
              label={t(`farmStatus.${k.status}`)}
              count={k.count}
              dot={<FarmStatusDot status={k.status} />}
              testId={`farm-status-${k.status}`}
            />
          ))}
        </div>
      </div>
      <FarmMarksLegend neglectDays={neglectDays} gapPercent={gapPercent} />
    </div>
  )
}

/**
 * ★★ BC — LA LÉGENDE DES TROIS MARQUES, SEULE : sous la rangée des statuts en
 * forme large, et sous la section des statuts dans la feuille de filtres au
 * téléphone (`wrap` : les marques passent à la ligne, rien ne défile de côté).
 */
export function FarmMarksLegend({ neglectDays, gapPercent, wrap = false }: { neglectDays: number; gapPercent: number; wrap?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<MarkKey | null>(null)
  const sentence: Record<MarkKey, string> = {
    status: t('farmMarks.statusSentence'),
    neglect: t('farmMarks.neglectSentence', { days: neglectDays }),
    gap: t('farmMarks.gapSentence', { percent: gapPercent }),
  }
  const mark = (key: MarkKey, glyph: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setOpen((v) => (v === key ? null : key))}
      aria-expanded={open === key}
      aria-controls="farm-marks-sentence"
      data-testid={`farm-mark-legend-${key}`}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-micro transition-colors duration-fast ${
        open === key ? 'bg-accent/15 font-semibold text-accent-ink' : 'text-content-secondary hover:text-content-primary'
      }`}
    >
      {glyph}
      <span className="whitespace-nowrap">{label}</span>
      <Icon name="info" size={13} className="opacity-60" />
    </button>
  )
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1" data-testid="farm-marks-legend">
        <span className="shrink-0 text-micro font-semibold text-content-muted">{t('farmMarks.legendTitle')}</span>
        <div className={wrap ? 'flex min-w-0 flex-1 flex-wrap items-center gap-2' : 'one-line-row min-w-0 flex-1 !gap-0.5 !py-0'}>
          {mark('status', <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-pill bg-farm-signed" />, t('farmMarks.status'))}
          {mark(
            'neglect',
            <span className="inline-flex items-center gap-0.5">
              <span className="inline-block size-2 shrink-0 rounded-pill border border-status-warn-ink/70" />
              <span className="inline-block size-2 shrink-0 rounded-pill border border-status-warn-ink/70 bg-status-warn-ink/25" />
            </span>,
            t('farmMarks.neglect'),
          )}
          {mark('gap', <span className="inline-block size-2 shrink-0 rounded-[2px] border border-status-warn-ink/70 bg-status-warn-ink/45" />, t('farmMarks.gap'))}
        </div>
      </div>
      {open && (
        <p id="farm-marks-sentence" role="note" data-testid="farm-marks-sentence" data-mark={open} className="rounded-field border border-edge-subtle bg-surface-high px-3 py-2 text-caption leading-relaxed text-content-secondary">
          {sentence[open]}
        </p>
      )}
    </div>
  )
}

function StatusSegment({ active, onClick, label, count, dot, testId }: { active: boolean; onClick: () => void; label: string; count: number; dot?: React.ReactNode; testId: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-micro transition-colors duration-fast ${
        active ? 'border-accent bg-surface-raised font-semibold text-content-primary shadow-card' : 'border-transparent text-content-secondary hover:text-content-primary'
      }`}
    >
      {dot}
      <span className="whitespace-nowrap">{label}</span>
      <span className="numeric text-content-muted">{count}</span>
    </button>
  )
}
