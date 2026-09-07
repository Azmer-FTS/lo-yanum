import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WEIGHTED_DUNAM_TARGET, formatDate } from '@core/index'

import { Icon } from '../components/Icon'
import { Section } from '../components/primitives'
import { useLocale } from '../hooks/useLocale'
import { defaultTarget, resetTarget, useTarget, writeTarget } from './target'
import type { Target } from './target'

/**
 * ★★ AB5a (2026-09-08) — « יעד » DANS LES RÉGLAGES.
 *
 * See `target.ts` for what is stored and why it is stored on the device. What
 * is here is the editing: the campaign now, what happens when it is passed,
 * the campaign that takes over, and the ones that are done.
 *
 * ⚠️ THE HISTORY IS READ-ONLY AND THAT IS DELIBERATE. It is a record of what
 *    was achieved, not a field; an editable past total is a total nobody can
 *    quote. The one control over it is « חזרה לערך ההתחלתי », which says
 *    plainly that it clears everything, including the record.
 */
export function TargetSection() {
  const { t } = useTranslation()
  const locale = useLocale()
  const state = useTarget()

  const [label, setLabel] = useState(state.current.label)
  const [dunams, setDunams] = useState(String(state.current.dunams))
  const [dueOn, setDueOn] = useState(state.current.dueOn)
  const [nextLabel, setNextLabel] = useState(state.next?.label ?? '')
  const [nextDunams, setNextDunams] = useState(
    state.next ? String(state.next.dunams) : '',
  )
  const [nextDueOn, setNextDueOn] = useState(state.next?.dueOn ?? '')
  const [saved, setSaved] = useState<'idle' | 'saved' | 'bad'>('idle')

  const readNext = (): Target | null => {
    const n = Number(nextDunams)
    if (!Number.isFinite(n) || n <= 0) return null
    return { label: nextLabel, dunams: Math.round(n), dueOn: nextDueOn }
  }

  const save = (onReached = state.onReached) => {
    const n = Number(dunams)
    if (!Number.isFinite(n) || n <= 0) {
      setSaved('bad')
      return
    }
    writeTarget({
      ...state,
      current: { label, dunams: Math.round(n), dueOn },
      onReached,
      next: readNext(),
    })
    setSaved('saved')
  }

  const field = (
    id: string,
    labelKey: string,
    value: string,
    onChange: (v: string) => void,
    type: 'text' | 'number' | 'date',
    testId: string,
    placeholder?: string,
  ) => (
    <div>
      <label className="label" htmlFor={id}>
        {t(labelKey)}
      </label>
      <input
        id={id}
        type={type}
        dir={type === 'text' ? undefined : 'ltr'}
        inputMode={type === 'number' ? 'numeric' : undefined}
        className="input w-full"
        data-testid={testId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setSaved('idle')
        }}
      />
    </div>
  )

  return (
    <Section
      title={t('settings.target.title')}
      className="mt-6"
      collapseKey="settings-target"
      summary={`${state.current.dunams.toLocaleString(locale)}${
        state.current.label ? ` · ${state.current.label}` : ''
      }`}
    >
      <p className="muted mb-3">{t('settings.target.hint')}</p>

      <div className="auto-cols gap-3 [--col-min:11rem]">
        {field('target-label', 'settings.target.label', label, setLabel, 'text', 'target-label', t('settings.target.labelPlaceholder'))}
        {field('target-dunams', 'settings.target.dunams', dunams, setDunams, 'number', 'target-dunams')}
        {field('target-due', 'settings.target.dueOn', dueOn, setDueOn, 'date', 'target-due')}
      </div>

      {/* AB5a.2 — the behaviour, and « keep and congratulate » is the default. */}
      <fieldset className="mt-4">
        <legend className="label">{t('settings.target.onReached')}</legend>
        <div className="pill-row" data-testid="target-on-reached">
          {(['keep', 'next'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={state.onReached === mode}
              data-mode={mode}
              onClick={() => save(mode)}
              className={`filter-pill ${state.onReached === mode ? 'filter-pill-active' : ''}`}
            >
              {t(`settings.target.${mode}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {state.onReached === 'next' && (
        <div className="mt-4 rounded-card bg-surface-high p-3" data-testid="target-next">
          <p className="text-caption font-semibold text-content-primary">
            {t('settings.target.nextTitle')}
          </p>
          <p className="muted mb-2">{t('settings.target.nextHint')}</p>
          <div className="auto-cols gap-3 [--col-min:11rem]">
            {field('target-next-label', 'settings.target.label', nextLabel, setNextLabel, 'text', 'target-next-label')}
            {field('target-next-dunams', 'settings.target.dunams', nextDunams, setNextDunams, 'number', 'target-next-dunams')}
            {field('target-next-due', 'settings.target.dueOn', nextDueOn, setNextDueOn, 'date', 'target-next-due')}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" data-testid="target-save" onClick={() => save()}>
          <Icon name="check" size={16} />
          {t('common.save')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          data-testid="target-reset"
          onClick={() => {
            resetTarget()
            const d = defaultTarget()
            setLabel(d.current.label)
            setDunams(String(d.current.dunams))
            setDueOn(d.current.dueOn)
            setNextLabel('')
            setNextDunams('')
            setNextDueOn('')
            setSaved('idle')
          }}
        >
          <Icon name="history" size={16} />
          {t('settings.target.reset')}
        </button>
        {saved !== 'idle' && (
          <span
            className={`text-caption ${
              saved === 'bad' ? 'text-status-danger-ink' : 'text-status-success-ink'
            }`}
            data-testid="target-hint"
            role={saved === 'bad' ? 'alert' : undefined}
          >
            {t(saved === 'bad' ? 'settings.target.bad' : 'settings.target.saved')}
          </span>
        )}
        <span className="muted ms-auto ltr-nums" data-testid="target-initial">
          {WEIGHTED_DUNAM_TARGET.toLocaleString(locale)}
        </span>
      </div>

      {/* AB5a.3 — « le PO travaille par campagnes budgétaires ». */}
      <div className="mt-4">
        <p className="label">{t('settings.target.history')}</p>
        {state.history.length === 0 ? (
          <p className="muted" data-testid="target-history-empty">
            {t('settings.target.historyEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="target-history">
            {state.history.map((row, i) => (
              <li
                key={`${row.reachedOn}-${i}`}
                data-testid="target-history-row"
                className="flex flex-wrap items-baseline gap-x-2 rounded-field bg-surface-high px-2.5 py-1.5"
              >
                <span className="text-caption font-medium text-content-primary">
                  {row.label || t('settings.target.unnamed')}
                </span>
                <span className="numeric text-micro text-content-secondary">
                  {row.dunams.toLocaleString(locale)}
                </span>
                <span className="muted ms-auto ltr-nums">
                  {row.reachedOn ? formatDate(`${row.reachedOn}T00:00:00`, locale) : '—'}
                  {' · '}
                  {row.total.toLocaleString(locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
