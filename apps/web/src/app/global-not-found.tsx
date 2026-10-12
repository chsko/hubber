import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Document } from "@/lib/document";

export const metadata: Metadata = { title: "Fant ikke siden – Hubber" };

export default function GlobalNotFound() {
  return (
    <Document lang="nb">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
        <Logo />
        <h1 className="text-3xl font-extrabold tracking-tight">Fant ikke siden</h1>
        <p className="text-lg leading-relaxed text-textMuted">
          Lenken kan være feil, eller siden finnes ikke lenger.
        </p>
        <Link href="/" className="text-[17px] font-bold text-primary hover:text-primaryStrong">
          Til forsiden
        </Link>
      </main>
    </Document>
  );
}
