import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { IMPORT_KINDS, IMPORT_TEMPLATES } from '@core/index'
import type { ImportKind } from '@core/index'

import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ★★ AA4 · AA5 (2026-09-07) — FIVE IMPORTS, ONE ROW OF TABS.
 *
 * G10 put the three roster templates one tap apart, on the reasoning that a
 * coordinator who lands on the volunteers import and realises he meant the
 * farms sheet should not have to go back out through two screens. AA4 and AA5
 * add two more — the association's prospection workbook and its signed
 * consents — and the same reasoning applies with more force: the two new ones
 * are files that arrive from OUTSIDE, and the coordinator will routinely have
 * both open on his desk.
 *
 * ⚠️ THE TWO NEW KINDS ARE A DIFFERENT SCREEN, and the tab row is what makes
 *    that invisible. They do not share the roster wizard's pipeline — their
 *    identity rule, their preview and their report are their own — so
 *    pretending otherwise inside one component would have meant a screen with
 *    two of everything. Here they are two routes and one row of tabs.
 */
/**
 * ★★ AB6.7 — AND A THIRD: THE ASSOCIATION'S OWN FILE, COMING BACK.
 *
 * « Test d'aller-retour : export au format association, réimport dans l'app,
 *   aucune perte ni doublon. » A format this app can write and cannot read is
 *   a one-way door, and a one-way door is how the coordinator ends up with two
 *   copies of a farm the week the association sends his own file back.
 */
export type SheetKind = 'prospection' | 'signatures' | 'association'
export type AnyImportKind = ImportKind | SheetKind

const ICON: Record<AnyImportKind, IconName> = {
  volunteers: 'users',
  farms: 'farm',
  drivers: 'steering',
  prospection: 'table',
  signatures: 'edit',
  association: 'document',
}

const LABEL_KEY: Record<AnyImportKind, string> = {
  volunteers: IMPORT_TEMPLATES.volunteers.titleKey,
  farms: IMPORT_TEMPLATES.farms.titleKey,
  drivers: IMPORT_TEMPLATES.drivers.titleKey,
  prospection: 'import.templateProspection',
  signatures: 'import.templateSignatures',
  association: 'import.templateAssociation',
}

export const ALL_IMPORT_KINDS: readonly AnyImportKind[] = [
  ...IMPORT_KINDS,
  'prospection',
  'signatures',
  'association',
]

export function ImportTabs({
  current,
  onLeave,
}: {
  current: AnyImportKind
  /** Reset the screen's own wizard state before navigating away. */
  onLeave?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    /* AA1.2 — `.pill-row`, like every other row of pills in the app. */
    <div className="pill-row mb-4" data-testid="import-tabs">
      {ALL_IMPORT_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            if (k === current) return
            onLeave?.()
            navigate(`/coordinator/import/${k}`)
          }}
          aria-pressed={k === current}
          data-testid={`import-tab-${k}`}
          className={`filter-pill px-3 ${k === current ? 'filter-pill-active' : ''}`}
        >
          <Icon name={ICON[k]} size={14} />
          {t(LABEL_KEY[k])}
        </button>
      ))}
    </div>
  )
}
