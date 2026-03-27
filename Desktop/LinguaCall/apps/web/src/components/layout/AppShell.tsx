import type { ReactNode } from 'react';
import { cn } from '../ui/cn';

export function AppShell({
  children,
  headerActions,
  className
}: {
  children: ReactNode;
  headerActions?: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffaf3_0%,#ffffff_16%,#f8fafc_100%)] text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <div className="relative z-40 mb-8 flex items-center justify-between gap-4 rounded-full border border-white/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
              LinguaCall
            </div>
            <div className="hidden text-sm text-muted-foreground sm:block">
              Short speaking practice for real routines
            </div>
          </div>
          <div className="relative z-50 flex items-center gap-2 overflow-visible">{headerActions}</div>
        </div>
        <main className={cn('flex-1 space-y-6', className)}>{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-sm backdrop-blur sm:p-8 lg:flex-row lg:items-end lg:justify-between',
        className
      )}
    >
      <div className="max-w-3xl space-y-3">
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
            {eyebrow}
          </div>
        )}
        <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function HeroSection({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[32px] border border-amber-200/60 bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#fff8eb_30%,#ffffff_82%)] p-6 shadow-sm sm:p-8',
        className
      )}
    >
      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/8 blur-3xl" aria-hidden />
      <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-orange-200/40 blur-3xl" aria-hidden />
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)] lg:items-end">
        <div className="space-y-4">
          {eyebrow && (
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
              {eyebrow}
            </div>
          )}
          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              {description}
            </p>
          )}
          {actions && <div className="flex flex-wrap gap-3 pt-2">{actions}</div>}
        </div>
        {aside && (
          <div className="rounded-[28px] border border-white/90 bg-white/85 p-4 shadow-sm backdrop-blur sm:p-5">
            {aside}
          </div>
        )}
      </div>
    </section>
  );
}
