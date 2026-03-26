import type { ReactNode } from 'react';
import { Card } from '../ui/card';

export default function AuthLayout({
  eyebrow,
  title,
  description,
  sidebarTitle,
  sidebarCopy,
  sidebarPoints,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  sidebarTitle: string;
  sidebarCopy: string;
  sidebarPoints: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff8ee_0%,#ffffff_40%,#f8fafc_100%)] px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_minmax(24rem,0.85fr)] lg:items-center">
        <section className="relative overflow-hidden rounded-[36px] border border-amber-200/50 bg-[radial-gradient(circle_at_top_left,#fde68a_0%,#fff7ed_35%,#ffffff_78%)] p-8 shadow-sm sm:p-10 lg:min-h-[34rem]">
          <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          <div className="absolute bottom-0 left-0 h-44 w-44 rounded-full bg-orange-200/50 blur-3xl" aria-hidden />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-5">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
                {eyebrow}
              </div>
              <div className="max-w-2xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl">
                  {title}
                </h1>
                <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                  {description}
                </p>
              </div>
            </div>
            <div className="grid gap-4 rounded-[28px] border border-white/90 bg-white/80 p-5 shadow-sm backdrop-blur sm:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-2">
                <h2 className="text-base font-semibold tracking-tight text-slate-950">
                  {sidebarTitle}
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">{sidebarCopy}</p>
              </div>
              <ul className="grid gap-3">
                {sidebarPoints.map(point => (
                  <li
                    key={point}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm text-slate-700"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <Card className="overflow-hidden rounded-[32px] border-white/90 bg-white/95 shadow-xl shadow-slate-200/60">
          {children}
        </Card>
      </div>
    </div>
  );
}
