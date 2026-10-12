import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/screen";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen title={t("notFound.title")}>
      <Link href="/" className="font-sans-bold text-[15px] text-primary">
        {t("notFound.goHome")}
      </Link>
    </Screen>
  );
}
