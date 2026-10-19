import { isLocaleLoaded, loadLocaleResources } from "./i18next";
import type { SupportedLocale } from "./locales";

interface I18nLanguageController {
  language?: string;
  changeLanguage: (language: SupportedLocale) => Promise<unknown>;
}

type I18nErrorReporter = (message: string, error: unknown) => void;

export interface I18nLanguageDeps {
  isLocaleLoaded: (locale: SupportedLocale) => boolean;
  loadLocale: (locale: SupportedLocale) => Promise<void>;
}

const defaultDeps: I18nLanguageDeps = {
  isLocaleLoaded,
  loadLocale: loadLocaleResources,
};

export const reportI18nError: I18nErrorReporter = (message, error) => {
  console.error(message, error);
};

// The provider calls this during render. A locale dictionary may still be
// loading, so remember the latest request and let an older load finish without
// switching back after the user has already picked another language.
let requestedLocale: SupportedLocale | null = null;

export function ensureI18nLanguageForRender(
  locale: SupportedLocale,
  i18n: I18nLanguageController,
  reportError: I18nErrorReporter = reportI18nError,
  deps: I18nLanguageDeps = defaultDeps,
): void {
  requestedLocale = locale;

  if (deps.isLocaleLoaded(locale)) {
    if (i18n.language === locale) {
      return;
    }
    i18n
      .changeLanguage(locale)
      .catch((error) => reportError("[i18n] Failed to change language", error));
    return;
  }

  deps
    .loadLocale(locale)
    .then(() => {
      if (requestedLocale !== locale || i18n.language === locale) {
        return;
      }
      return i18n.changeLanguage(locale);
    })
    .catch((error) => reportError("[i18n] Failed to load language", error));
}
