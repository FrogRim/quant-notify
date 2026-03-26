import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';

export function StaticDocumentPage({
  eyebrow,
  title,
  updatedAt,
  locale = 'en',
  children
}: {
  eyebrow: string;
  title: string;
  updatedAt: string;
  locale?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const isKo = locale.startsWith('ko');

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff8ee_0%,#ffffff_36%,#f8fafc_100%)] px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            {isKo ? '뒤로' : 'Back'}
          </Button>
        </div>

        <section className="rounded-[32px] border border-amber-200/50 bg-[radial-gradient(circle_at_top_left,#fde68a_0%,#fff7ed_35%,#ffffff_82%)] p-8 shadow-sm sm:p-10">
          <div className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
              {eyebrow}
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl">
              {title}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {isKo ? `최종 업데이트 ${updatedAt}` : `Updated ${updatedAt}`}
            </p>
          </div>
        </section>

        <article className="rounded-[32px] border border-white/90 bg-white/95 px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          <div className="space-y-8 text-sm leading-7 text-slate-700 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:m-0 [&_ul]:m-0 [&_ul]:space-y-2 [&_ul]:pl-5">
            {children}
          </div>
        </article>
      </div>
    </div>
  );
}
