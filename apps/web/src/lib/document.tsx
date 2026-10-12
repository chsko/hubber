import { Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { themeCss } from "@/lib/theme-css";
import "@/app/globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

/** Shared <html> shell for the nb and en root layouts. */
export function Document({ lang, children }: { lang: "nb" | "en"; children: ReactNode }) {
  return (
    <html lang={lang} className={`${figtree.variable} h-full antialiased`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
