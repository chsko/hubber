import { Link } from "expo-router";
import { Screen } from "@/components/screen";

export default function NotFound() {
  return (
    <Screen title="Fant ikke siden">
      <Link href="/" className="font-sans-bold text-[15px] text-primary">
        Gå til Hjem
      </Link>
    </Screen>
  );
}
