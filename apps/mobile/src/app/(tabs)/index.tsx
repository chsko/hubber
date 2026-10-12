import { useTranslation } from "react-i18next";
import { ComingSoon, Screen } from "@/components/screen";

export default function HomeScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t("tabs.home")} subtitle={t("common.appName")}>
      <ComingSoon>{t("home.comingSoon")}</ComingSoon>
    </Screen>
  );
}
