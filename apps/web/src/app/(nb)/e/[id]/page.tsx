import type { Metadata } from "next";
import { OpenInApp } from "@/components/open-in-app";
import { RequestTime } from "@/components/request-time";

// Stub: real, server-rendered event pages with link previews arrive in HUB-31.
export const metadata: Metadata = {
  title: "Arrangement – Hubbr",
  robots: { index: false },
  alternates: {}, // not a language variant of the landing page
};

export default function EventPage() {
  return (
    <>
      <RequestTime />
      <OpenInApp
        title="Et arrangement på Hubbr"
        body="Åpne lenken i Hubbr-appen for å se arrangementet og svare. Appen kommer snart."
      />
    </>
  );
}
