import Link from "next/link";
import type { LandingContent } from "@/content/landing";
import { Logo } from "@/components/logo";

export function Landing({ c }: { c: LandingContent }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-8">
        <Logo />
        <Link
          href={c.switchLanguage.href}
          className="rounded-full px-3 py-2 text-[15px] font-semibold text-primary hover:text-primaryStrong"
        >
          {c.switchLanguage.label}
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 pt-8 pb-20 sm:px-8 sm:pt-16">
        <section className="flex max-w-2xl flex-col gap-6">
          <h1 className="text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl">
            {c.headline}
          </h1>
          <p className="text-lg leading-relaxed text-textMuted sm:text-xl">{c.lead}</p>
          <p className="inline-flex w-fit items-center rounded-full bg-accentSoft px-4 py-2 text-[15px] font-bold text-onAccentSoft">
            {c.storesComingSoon}
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {c.promises.map((p) => (
            <article
              key={p.title}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6"
            >
              <h2 className="text-lg font-bold">{p.title}</h2>
              <p className="leading-relaxed text-textMuted">{p.body}</p>
            </article>
          ))}
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-2xl font-extrabold tracking-tight">{c.stepsTitle}</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {c.steps.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-surface tabular-nums">
                  {i + 1}
                </span>
                <span className="pt-1.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-border">
        <p className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-textMuted sm:px-8">
          {c.footer}
        </p>
      </footer>
    </>
  );
}
