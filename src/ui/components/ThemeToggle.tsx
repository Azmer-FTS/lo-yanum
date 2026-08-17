import { useTranslation } from 'react-i18next'

import { THEME_CHOICES } from '@core/index'
import type { ThemeChoice } from '@core/index'

import { useTheme } from '../theme'
import { Icon } from './Icon'
import type { IconName } from './Icon'

const ICON: Record<ThemeChoice, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'display',
}

/**
 * Three-position theme switch: light / dark / system (C2).
 *
 * A segmented control rather than a cycling button, because the third state
 * ("follow the system") is invisible in a two-state toggle — the user cannot
 * tell whether dark is their choice or their OS's.
 */
export function ThemeToggle({
  compact = false,
  /** Stack the three segments — only the collapsed desktop rail needs this. */
  vertical = false,
}: {
  compact?: boolean
  vertical?: boolean
}) {
  const { t } = useTranslation()
  const { choice, setChoice } = useTheme()

  return (
    <div
      role="group"
      aria-label={t('theme.label')}
      // Vertical is for the collapsed rail only: three segments side by side
      // are wider than 4.5 rem and spilled over the rail's edge onto the map.
      className={`inline-flex rounded-field border border-edge-subtle bg-surface-field p-0.5 ${
        vertical ? 'flex-col' : ''
      }`}
    >
      {THEME_CHOICES.map((option) => {
        const active = choice === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => setChoice(option)}
            aria-pressed={active}
            title={t(`theme.${option}`)}
            className={`flex items-center gap-1.5 rounded-field px-2 py-1.5 text-micro font-medium
                        transition-all duration-fast ease-out ${
                          active
                            ? 'bg-accent text-content-on-accent'
                            : 'text-content-muted hover:text-content-primary'
                        }`}
          >
            <Icon name={ICON[option]} size={14} />
            {!compact && <span>{t(`theme.${option}`)}</span>}
          </button>
        )
      })}
    </div>
  )
}
