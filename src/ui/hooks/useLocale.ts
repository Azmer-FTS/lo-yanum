import { useTranslation } from 'react-i18next'

/** The BCP-47 tag to hand to Intl formatters in @core/clock. */
export function useLocale(): string {
  const { i18n } = useTranslation()
  return i18n.language || 'he'
}
