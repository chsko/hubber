import type { Metadata } from "next";
import { OpenInApp } from "@/components/open-in-app";
import { RequestTime } from "@/components/request-time";

// Stub: real invite pages with hub name, icon and member count arrive in HUB-16.
export const metadata: Metadata = {
  title: "Invitasjon – Hubber",
  robots: { index: false },
  alternates: {}, // not a language variant of the landing page
};

export default function InvitePage() {
  return (
    <>
      <RequestTime />
      <OpenInApp
        title="Du er invitert til en hub"
        body="Åpne lenken i Hubber-appen og bli med med Vipps. Appen kommer snart."
      />
    </>
  );
}
