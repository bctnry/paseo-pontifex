import { createInstance, type ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";
import { observeI18nInit } from "./init";
import type { SupportedLocale } from "./locales";
import { en } from "./resources/en";

const i18n = createInstance();

const i18nInitPromise = i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  fallbackLng: "en",
  lng: "en",
  resources: {
    en: { translation: en },
  },
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});
observeI18nInit(i18nInitPromise);

// Keep English in the initial bundle as the fallback, and fetch every other
// dictionary on demand. The locale files are large and most sessions only use
// one language, so bundling all of them makes every cold start parse dead data.
const localeResourceLoaders: Record<
  Exclude<SupportedLocale, "en">,
  () => Promise<ResourceLanguage>
> = {
  ar: async () => (await import("./resources/ar")).ar as ResourceLanguage,
  es: async () => (await import("./resources/es")).es as ResourceLanguage,
  fr: async () => (await import("./resources/fr")).fr as ResourceLanguage,
  ja: async () => (await import("./resources/ja")).ja as ResourceLanguage,
  ko: async () => (await import("./resources/ko")).ko as ResourceLanguage,
  "pt-BR": async () => (await import("./resources/pt-BR")).ptBR as ResourceLanguage,
  ru: async () => (await import("./resources/ru")).ru as ResourceLanguage,
  "zh-CN": async () => (await import("./resources/zh-CN")).zhCN as ResourceLanguage,
};

const loadedLocales = new Set<SupportedLocale>(["en"]);
const pendingLocaleLoads = new Map<SupportedLocale, Promise<void>>();

export function isLocaleLoaded(locale: SupportedLocale): boolean {
  return loadedLocales.has(locale);
}

export function loadLocaleResources(locale: SupportedLocale): Promise<void> {
  if (locale === "en" || isLocaleLoaded(locale)) {
    return Promise.resolve();
  }
  const pending = pendingLocaleLoads.get(locale);
  if (pending) {
    return pending;
  }
  const resourcesPromise = localeResourceLoaders[locale]();
  const load = Promise.all([i18nInitPromise, resourcesPromise])
    .then(([, resources]) => {
      i18n.addResourceBundle(locale, "translation", resources, true, true);
      loadedLocales.add(locale);
    })
    .finally(() => {
      pendingLocaleLoads.delete(locale);
    });
  pendingLocaleLoads.set(locale, load);
  return load;
}

export { i18n, i18nInitPromise };
