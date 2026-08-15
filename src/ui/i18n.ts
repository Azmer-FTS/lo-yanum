import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en.json'
import fr from '../locales/fr.json'
import he from '../locales/he.json'

export type AppLanguage = 'he' | 'en' | 'fr'

/** Text direction per language — drives `dir` on <html> and RTL-aware layout. */
export const LANGUAGE_DIR: Record<AppLanguage, 'rtl' | 'ltr'> = {
  he: 'rtl',
  en: 'ltr',
  fr: 'ltr',
}

/** Launch language. `en` and `fr` are wired but intentionally untranslated. */
export const DEFAULT_LANGUAGE: AppLanguage = 'he'

void i18n.use(initReactI18next).init({
  resources: {
    he: { translation: he },
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ['he', 'en', 'fr'],
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function applyLanguage(lang: AppLanguage): void {
  void i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  document.documentElement.dir = LANGUAGE_DIR[lang]
}

export default i18n
