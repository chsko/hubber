import type { Metadata } from "next";
import { landing } from "@/content/landing";
import { Document } from "@/lib/document";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: landing.en.metaTitle,
  description: landing.en.metaDescription,
  alternates: { canonical: "/en", languages: { nb: "/", en: "/en" } },
  openGraph: { type: "website", locale: "en_GB", siteName: "Hubbr" },
};

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return <Document lang="en">{children}</Document>;
}
