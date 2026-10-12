import { useTranslation } from "react-i18next";
import { ComingSoon, Screen } from "@/components/screen";

export default function HubsScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t("tabs.hubs")}>
      <ComingSoon>{t("hubs.comingSoon")}</ComingSoon>
    </Screen>
  );
}
