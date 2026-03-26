import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CreditCard } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import { Button } from '../components/ui/button';
import { getFriendlyCopy } from '../content/friendlyCopy';
import { useUser } from '../context/UserContext';

export default function ScreenLogin() {
  const { i18n } = useTranslation();
  const { isAuthenticated, sessionChecked } = useUser();
  const navigate = useNavigate();
  const copy = getFriendlyCopy(i18n.language);

  useEffect(() => {
    if (sessionChecked && isAuthenticated) {
      navigate('/session');
    }
  }, [isAuthenticated, navigate, sessionChecked]);

  return (
    <AuthLayout
      eyebrow={copy.login.eyebrow}
      title={copy.login.title}
      description={copy.login.description}
      sidebarTitle={copy.login.valueTitle}
      sidebarCopy={copy.login.valueSummary}
      sidebarPoints={copy.login.bullets}
    >
      <div className="space-y-8 px-8 py-8 sm:px-10 sm:py-10">
        <div className="space-y-3">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            LinguaCall
          </div>
          <h2 className="text-3xl font-semibold tracking-[-0.05em] text-slate-950">
            {copy.common.quickPractice}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.login.description}
          </p>
        </div>

        <div className="grid gap-3">
          <Button size="lg" className="w-full gap-2" onClick={() => navigate('/verify')}>
            <span>{copy.login.primaryCta}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full gap-2"
            onClick={() => navigate('/billing')}
          >
            <CreditCard className="h-4 w-4" />
            <span>{copy.login.secondaryCta}</span>
          </Button>
        </div>

        <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
          {copy.login.bullets.map(point => (
            <div key={point} className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              {point}
            </div>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
