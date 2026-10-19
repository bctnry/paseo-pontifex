import { describe, expect, it, vi } from "vitest";
import { ensureI18nLanguageForRender, type I18nLanguageDeps } from "./sync-language";

function createI18n(initialLanguage = "en") {
  const i18n = {
    language: initialLanguage as string,
    changeLanguage: vi.fn((locale: string) => {
      i18n.language = locale;
      return Promise.resolve();
    }),
  };
  return i18n;
}

const loadedDeps: I18nLanguageDeps = {
  isLocaleLoaded: () => true,
  loadLocale: () => Promise.resolve(),
};

describe("ensureI18nLanguageForRender", () => {
  it("changes the i18n language before callers render children when the bundle is loaded", () => {
    const i18n = createI18n();

    ensureI18nLanguageForRender("zh-CN", i18n, undefined, loadedDeps);

    expect(i18n.language).toBe("zh-CN");
    expect(i18n.changeLanguage).toHaveBeenCalledWith("zh-CN");
  });

  it("does not call changeLanguage when the current language already matches", () => {
    const i18n = createI18n("en");

    ensureI18nLanguageForRender("en", i18n, undefined, loadedDeps);

    expect(i18n.changeLanguage).not.toHaveBeenCalled();
  });

  it("waits for an unloaded locale before changing language", async () => {
    let resolveLoad: () => void = () => {};
    const loadLocale = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const i18n = createI18n();

    ensureI18nLanguageForRender("zh-CN", i18n, undefined, {
      isLocaleLoaded: () => false,
      loadLocale,
    });

    expect(loadLocale).toHaveBeenCalledWith("zh-CN");
    expect(i18n.changeLanguage).not.toHaveBeenCalled();

    resolveLoad();
    await vi.waitFor(() => expect(i18n.changeLanguage).toHaveBeenCalledWith("zh-CN"));
    expect(i18n.language).toBe("zh-CN");
  });

  it("does not apply a stale locale after the user switches again", async () => {
    const pendingLoads = new Map<string, () => void>();
    const loadLocale = vi.fn(
      (locale: string) =>
        new Promise<void>((resolve) => {
          pendingLoads.set(locale, resolve);
        }),
    );
    const deps: I18nLanguageDeps = {
      isLocaleLoaded: (locale) => locale === "en",
      loadLocale,
    };
    const i18n = createI18n();

    ensureI18nLanguageForRender("ja", i18n, undefined, deps);
    ensureI18nLanguageForRender("en", i18n, undefined, deps);

    pendingLoads.get("ja")?.();
    await Promise.resolve();

    expect(i18n.changeLanguage).not.toHaveBeenCalled();
    expect(i18n.language).toBe("en");
  });

  it("reports a failed locale load without changing language", async () => {
    const report = vi.fn();
    const i18n = createI18n();

    ensureI18nLanguageForRender("fr", i18n, report, {
      isLocaleLoaded: () => false,
      loadLocale: () => Promise.reject(new Error("offline")),
    });

    await vi.waitFor(() => expect(report).toHaveBeenCalled());
    expect(i18n.changeLanguage).not.toHaveBeenCalled();
  });
});
