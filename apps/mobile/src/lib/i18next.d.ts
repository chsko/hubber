import type { Messages } from "@hubber/i18n";

// Type-checks translation keys: t("tabs.home") compiles, t("tabs.typo") does not.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Messages };
  }
}
