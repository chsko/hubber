import { useTranslation } from "react-i18next";
import { ComingSoon, Screen } from "@/components/screen";

export default function CalendarScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t("tabs.calendar")}>
      <ComingSoon>{t("calendar.comingSoon")}</ComingSoon>
    </Screen>
  );
}
