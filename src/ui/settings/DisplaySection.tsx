import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { THEME_CHOICES } from '@core/index'
import type { ThemeChoice } from '@core/index'

import { ChevronForward, Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { Section } from '../components/primitives'
import { useLayoutSync, writeLayoutSync } from '../components/mapMode'
import type { LayoutSync } from '../components/mapMode'
import { useTheme } from '../theme'

const THEME_ICON: Record<ThemeChoice, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'display',
}

const SYNC_ICON: Record<LayoutSync, IconName> = {
  free: 'columns',
  synced: 'switch',
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ Y3.1 · Y4 (2026-09-06) — "תצוגה". THE TWO SETTINGS THAT WERE NOWHERE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Y3.1 — THE THEME LEFT THE RAIL. "Le sélecteur de thème quitte le rail
 *        latéral et part dans l'écran de réglages. Le rail droit est
 *        encombré." Three segments in a 4.5 rem column, stacked vertically
 *        beside the map, permanently — for a choice a person makes once a
 *        season. It is a settings row now, spelled out, with "לפי המכשיר" as
 *        a real third option rather than an absence.
 *
 * Y4   — "סנכרון פריסה", the setting that did not exist. See `mapMode.tsx`
 *        for the mechanism, which is one key rather than one per screen.
 *        Default `free`, which is the behaviour that shipped: a device that
 *        never opens this section behaves exactly as it did.
 *
 * ★ AND BOTH ARE PER DEVICE, deliberately. A coordinator's iPad in a truck and
 *   the same coordinator's laptop at a desk want different answers to both
 *   questions, and neither is a fact about the programme.
 */
export function DisplaySection() {
  const { t } = useTranslation()
  const { choice, setChoice } = useTheme()
  const sync = useLayoutSync()

  return (
    <Section title={t('settings.display.title')} className="mt-6" collapseKey="settings-display">
      <p className="muted">{t('settings.display.hint')}</p>

      <div className="mt-3">
        <span className="label">{t('theme.label')}</span>
        <div
          role="group"
          aria-label={t('theme.label')}
          data-testid="settings-theme"
          className="mt-1.5 flex flex-wrap items-center gap-1.5"
        >
          {THEME_CHOICES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setChoice(option)}
              aria-pressed={choice === option}
              data-testid={`settings-theme-${option}`}
              className={`filter-pill ${choice === option ? 'filter-pill-active' : ''}`}
            >
              <Icon name={THEME_ICON[option]} size={13} />
              {t(`theme.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <span className="label">{t('settings.display.syncLabel')}</span>
        <div
          role="group"
          aria-label={t('settings.display.syncLabel')}
          data-testid="settings-layout-sync"
          className="mt-1.5 flex flex-wrap items-center gap-1.5"
        >
          {(['free', 'synced'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => writeLayoutSync(option)}
              aria-pressed={sync === option}
              data-testid={`settings-layout-${option}`}
              className={`filter-pill ${sync === option ? 'filter-pill-active' : ''}`}
            >
              <Icon name={SYNC_ICON[option]} size={13} />
              {t(`settings.display.sync_${option}`)}
            </button>
          ))}
        </div>
        <p className="muted mt-1.5">{t(`settings.display.syncHint_${sync}`)}</p>
      </div>
    </Section>
  )
}

/**
 * ★★ Y2.1 — THE DOOR TO "עריכת אזורים", and it is a link rather than the
 *    editor itself. The editor is a full-screen map with an undo stack; it has
 *    no business sharing a scroll container with eleven settings blocks.
 */
export function RegionsEditSection() {
  const { t } = useTranslation()
  return (
    <Section title={t('regionEdit.title')} className="mt-6" collapseKey="settings-regions">
      <p className="muted">{t('regionEdit.hint')}</p>
      <Link
        to="/coordinator/settings/regions"
        data-testid="settings-regions-open"
        className="mt-3 flex items-center gap-3 rounded-field bg-surface-high px-3 py-3
                   text-caption font-medium text-content-primary
                   transition-colors duration-fast hover:bg-surface-sunken"
      >
        <Icon name="region" size={18} className="shrink-0 text-content-secondary" />
        <span className="min-w-0 flex-1">{t('regionEdit.open')}</span>
        <span className="shrink-0 text-content-muted/60">
          <ChevronForward />
        </span>
      </Link>
    </Section>
  )
}
