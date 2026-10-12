import { useTranslation } from "react-i18next";
import { ComingSoon, Screen } from "@/components/screen";

export default function DiscoverScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t("tabs.discover")} subtitle={t("discover.subtitle")}>
      <ComingSoon>{t("discover.comingSoon")}</ComingSoon>
    </Screen>
  );
}
