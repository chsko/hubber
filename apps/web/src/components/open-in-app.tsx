import { Logo } from "@/components/logo";

/** Placeholder for shared links until event/invite pages get real data (HUB-16, HUB-31). */
export function OpenInApp({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Logo />
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-lg leading-relaxed text-textMuted">{body}</p>
    </main>
  );
}
