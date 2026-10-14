import type { Metadata } from "next";
import { landing } from "@/content/landing";
import { Document } from "@/lib/document";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: landing.nb.metaTitle,
  description: landing.nb.metaDescription,
  alternates: { canonical: "/", languages: { nb: "/", en: "/en" } },
  openGraph: { type: "website", locale: "nb_NO", siteName: "Hubbr" },
};

export default function NbLayout({ children }: { children: React.ReactNode }) {
  return <Document lang="nb">{children}</Document>;
}
