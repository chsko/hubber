import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/logo";

// Fallback for invite links when the app isn't installed (or before universal
// links are live, HUB-32). The richer preview with hub name and icon is in the app.
export const metadata: Metadata = {
  title: "Invitasjon – Hubbr",
  robots: { index: false },
  alternates: {}, // not a language variant of the landing page
};

/** Same rule as the app's parseInviteInput: ten letters or digits. */
function cleanCode(raw: string): string | null {
  const code = decodeURIComponent(raw)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  return code.length === 10 ? code : null;
}

async function Invite({ params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  if (!code) {
    return (
      <>
        <h1 className="text-3xl font-extrabold tracking-tight">Ugyldig invitasjon</h1>
        <p className="text-lg leading-relaxed text-textMuted">
          Lenken ser ikke riktig ut. Be om en ny invitasjon fra den som inviterte deg.
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Du er invitert til en hub</h1>
      <a
        href={`hubber://i/${code}`}
        className="rounded-xl bg-primary px-4 py-4 text-center text-[17px] font-bold text-surface hover:bg-primaryStrong"
      >
        Åpne i Hubbr-appen
      </a>
      <p className="text-lg leading-relaxed text-textMuted">
        Åpnes ikke appen? Velg «Bli med via kode eller lenke» i appen og skriv inn koden:
      </p>
      <p className="rounded-2xl border border-border bg-surface p-4 text-center text-2xl font-extrabold tracking-widest tabular-nums select-all">
        {`${code.slice(0, 5)}-${code.slice(5)}`}
      </p>
    </>
  );
}

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Logo />
      <Suspense fallback={null}>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}
