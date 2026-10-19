import { beforeAll } from "vitest";
import { i18n, i18nInitPromise } from "./src/i18n/i18next";
import { ar } from "./src/i18n/resources/ar";
import { es } from "./src/i18n/resources/es";
import { fr } from "./src/i18n/resources/fr";
import { ja } from "./src/i18n/resources/ja";
import { ko } from "./src/i18n/resources/ko";
import { ptBR } from "./src/i18n/resources/pt-BR";
import { ru } from "./src/i18n/resources/ru";
import { zhCN } from "./src/i18n/resources/zh-CN";

// Production loads non-English dictionaries on demand. Tests call
// `i18n.changeLanguage(...)` directly and then assert translated copy, so give
// them every bundle up front.
const bundles = {
  ar,
  es,
  fr,
  ja,
  ko,
  "pt-BR": ptBR,
  ru,
  "zh-CN": zhCN,
} as const;

beforeAll(async () => {
  await i18nInitPromise;
  for (const [locale, resources] of Object.entries(bundles)) {
    i18n.addResourceBundle(locale, "translation", resources as never, true, true);
  }
});
