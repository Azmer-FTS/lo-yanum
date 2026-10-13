import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  formatDate,
  formatTime,
  getAllLeads,
  getGeneralMeeting,
  getInstitutions,
  getVisibleFarms,
  getVisibleGeneralMeetings,
  memoMatches,
  now,
} from '@core/index'
import type { TaskLink, TaskLinkKind } from '@core/index'

import { DictationField } from '../components/fields'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'

/**
 * ★★ BE (2026-10-13) — LE LIEN D'UN RENDEZ-VOUS OU D'UNE TÂCHE VERS UNE FICHE.
 *
 * « Le lien est ce qui rend l'agenda utile : de la fiche on voit le
 * rendez-vous, et du rendez-vous on ouvre la fiche. » Une puce qui dit OÙ elle
 * mène et y mène d'un toucher ; un sélecteur qui cherche dans les fiches DÉJÀ
 * en base (institutions, fermes, contacts à traiter, et pour une tâche les
 * rendez-vous) — le PO ne retape jamais un nom.
 */

export const LINK_ICON: Record<TaskLinkKind, IconName> = {
  institution: 'school',
  farm: 'farm',
  lead: 'phone',
  meeting: 'calendar',
}

export interface LinkTarget {
  label: string
  href: string
  icon: IconName
  /** La fiche n'existe plus (supprimée) : la puce le dit, sans lien. */
  missing: boolean
}

/** Où mène un lien, lu par les accesseurs (à appeler dans `useCoreValue`). */
export function linkTargetOf(link: TaskLink, locale: string, missingLabel: string): LinkTarget {
  const icon = LINK_ICON[link.kind]
  if (link.kind === 'institution') {
    const i = getInstitutions().find((x) => x.id === link.id)
    return { label: i?.name ?? missingLabel, href: `/coordinator/institutions/${link.id}`, icon, missing: !i }
  }
  if (link.kind === 'farm') {
    const f = getVisibleFarms().find((x) => x.id === link.id)
    return { label: f ? f.farmName || f.name : missingLabel, href: `/coordinator/farms/${link.id}`, icon, missing: !f }
  }
  if (link.kind === 'lead') {
    const l = getAllLeads().find((x) => x.id === link.id)
    return { label: l?.name || l?.contactName || missingLabel, href: `/coordinator/leads/${link.id}`, icon, missing: !l }
  }
  const m = getGeneralMeeting(link.id)
  return {
    label: m ? `${m.title} · ${formatDate(m.at, locale)} ${formatTime(m.at, locale)}` : missingLabel,
    href: `/coordinator/agenda?event=${encodeURIComponent(`meeting:${link.id}`)}`,
    icon,
    missing: !m,
  }
}

export function useLinkTarget(link: TaskLink | null | undefined): LinkTarget | null {
  const { t } = useTranslation()
  const locale = useLocale()
  return useCoreValue(() => (link ? linkTargetOf(link, locale, t('links.missing')) : null))
}

/** La puce : l'icône de la sorte de fiche, son nom ; un toucher l'ouvre. */
export function LinkChip({
  link,
  onOpen,
  testId = 'link-chip',
}: {
  link: TaskLink
  /** Par défaut, navigue vers la fiche. */
  onOpen?: (href: string) => void
  testId?: string
}) {
  const navigate = useNavigate()
  const target = useLinkTarget(link)
  if (!target) return null
  return (
    <button
      type="button"
      data-testid={testId}
      data-link-kind={link.kind}
      data-link-id={link.id}
      disabled={target.missing}
      onClick={() => (onOpen ? onOpen(target.href) : navigate(target.href))}
      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-pill bg-surface-high px-3 text-caption font-medium
                 text-content-primary hover:bg-accent/10 disabled:opacity-60"
    >
      <Icon name={target.icon} size={15} className="shrink-0 text-accent-ink" />
      <span className="min-w-0 truncate">{target.label}</span>
      {!target.missing && <Icon name="external" size={13} className="shrink-0 text-content-muted" />}
    </button>
  )
}

interface Candidate {
  link: TaskLink
  label: string
  sub: string
}

/**
 * Le sélecteur : la puce choisie (et sa croix), ou un champ de recherche et
 * ses résultats — au plus huit, 44 px chacun, l'icône dit la sorte de fiche.
 */
export function LinkPicker({
  value,
  onChange,
  kinds,
  label,
  testId = 'link-picker',
}: {
  value: TaskLink | null
  onChange: (next: TaskLink | null) => void
  kinds: readonly TaskLinkKind[]
  label: string
  testId?: string
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const institutions = useCoreValue(getInstitutions)
  const farms = useCoreValue(getVisibleFarms)
  const leads = useCoreValue(getAllLeads)
  const meetings = useCoreValue(getVisibleGeneralMeetings)

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = []
    if (kinds.includes('institution'))
      for (const i of institutions) out.push({ link: { kind: 'institution', id: i.id }, label: i.name, sub: `${t('links.kind.institution')} · ${i.locality}` })
    if (kinds.includes('farm'))
      for (const f of farms) out.push({ link: { kind: 'farm', id: f.id }, label: f.farmName || f.name, sub: `${t('links.kind.farm')} · ${f.locality}` })
    if (kinds.includes('lead'))
      for (const l of leads.filter((x) => !x.convertedFarmId)) out.push({ link: { kind: 'lead', id: l.id }, label: l.name || l.contactName, sub: `${t('links.kind.lead')} · ${l.place}` })
    if (kinds.includes('meeting')) {
      const from = now().getTime() - 14 * 86_400_000
      for (const m of meetings.filter((x) => Date.parse(x.at) >= from))
        out.push({ link: { kind: 'meeting', id: m.id }, label: m.title, sub: `${t('links.kind.meeting')} · ${formatDate(m.at, locale)} ${formatTime(m.at, locale)}` })
    }
    return out
  }, [kinds, institutions, farms, leads, meetings, t, locale])

  const results = useMemo(
    () => (query.trim() === '' ? [] : candidates.filter((c) => memoMatches({ he: c.label, fr: c.sub }, query)).slice(0, 8)),
    [candidates, query],
  )

  if (value) {
    return (
      <div className="col-span-full" data-testid={testId} data-linked="1">
        <span className="label">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <LinkChip link={value} testId={`${testId}-chip`} />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('links.remove')}
            data-testid={`${testId}-clear`}
            className="flex h-11 w-11 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="col-span-full" data-testid={testId} data-linked="0">
      <DictationField label={label} value={query} onChange={setQuery} placeholder={t('links.searchPlaceholder')} testId={`${testId}-search`} />
      {results.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1 rounded-field bg-surface-high p-1" data-testid={`${testId}-results`}>
          {results.map((c) => (
            <li key={`${c.link.kind}:${c.link.id}`}>
              <button
                type="button"
                data-testid={`${testId}-result`}
                onClick={() => {
                  onChange(c.link)
                  setQuery('')
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-field px-2 text-start hover:bg-surface-raised"
              >
                <Icon name={LINK_ICON[c.link.kind]} size={15} className="shrink-0 text-accent-ink" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption font-medium text-content-primary">{c.label}</span>
                  <span className="block truncate text-micro text-content-muted">{c.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== '' && results.length === 0 && <p className="muted mt-1">{t('links.none')}</p>}
    </div>
  )
}
