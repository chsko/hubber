import { defaultLocale, isLocale, type Locale, messages, resolveLocale } from "@hubbr/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import i18n from "i18next";
import { useSyncExternalStore } from "react";
import { initReactI18next, useTranslation } from "react-i18next";

/** "system" follows the device language; otherwise the user's choice from Profile. */
export type LanguagePreference = Locale | "system";

const STORAGE_KEY = "hubber.language";

/** The device's preferred language, mapped to one we support (Norwegian → nb, else en). */
export function deviceLocale(): Locale {
  return resolveLocale(getLocales().map((locale) => locale.languageTag));
}

void i18n.use(initReactI18next).init({
  resources: {
    nb: { translation: messages.nb },
    en: { translation: messages.en },
  },
  lng: deviceLocale(),
  fallbackLng: defaultLocale,
  supportedLngs: ["nb", "en"],
  // React already escapes rendered strings.
  interpolation: { escapeValue: false },
});

let preference: LanguagePreference = "system";
const listeners = new Set<() => void>();

function apply(next: LanguagePreference) {
  preference = next;
  void i18n.changeLanguage(next === "system" ? deviceLocale() : next);
  for (const listener of listeners) listener();
}

/** Restores the saved language choice. Call once at start-up, before hiding the splash screen. */
export async function loadLanguagePreference(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) apply(saved);
  } catch {
    // Storage unavailable: keep following the device language.
  }
}

/** Switches the app language now and remembers the choice on this device. */
export function setLanguagePreference(next: LanguagePreference): void {
  apply(next);
  const write =
    next === "system"
      ? AsyncStorage.removeItem(STORAGE_KEY)
      : AsyncStorage.setItem(STORAGE_KEY, next);
  write.catch(() => undefined);
}

export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preference,
  );
}

/** The active app language, for the date/time helpers in `@hubbr/i18n`. */
export function useLocale(): Locale {
  const { i18n: instance } = useTranslation();
  return isLocale(instance.language) ? instance.language : defaultLocale;
}

export { i18n };
