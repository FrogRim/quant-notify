import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CreditCard, Sparkles } from 'lucide-react';
import type { UserSubscription, BillingPlan, BillingCheckoutSession } from '@lingua/shared';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../components/ui/cn';
import LanguagePicker from '../components/ui/LanguagePicker';
import { AppShell, HeroSection, PageHeader } from '../components/layout/AppShell';
import { SectionCard, MetricCard, StatusBanner, EmptyState } from '../components/layout/SectionCard';
import { getFriendlyCopy, getPlanPresentation } from '../content/friendlyCopy';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError } from '../lib/api';
import { createCheckoutPayload, readTossRedirectParams } from '../features/billing/checkout';
import { startTossCheckout } from '../features/billing/toss';

export default function ScreenBilling() {
  const { t, i18n } = useTranslation();
  const { getToken } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copy = getFriendlyCopy(i18n.language);
  const isKo = i18n.language.startsWith('ko');

  const checkoutResult = searchParams.get('checkout') as 'success' | 'cancel' | null;
  const checkoutPlan = searchParams.get('plan');

  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const load = useCallback(async () => {
    const api = apiClient(getToken);
    setLoading(true);
    setError('');
    try {
      const [sub, planList] = await Promise.all([
        api.get<UserSubscription | null>('/billing/subscription'),
        api.get<BillingPlan[]>('/billing/plans')
      ]);
      setSubscription(sub);
      setPlans(planList);
    } catch (err) {
      setError(describeApiError(err, 'billing_load'));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (checkoutResult !== 'success') {
      return;
    }

    const redirect = readTossRedirectParams(window.location.href);
    if (!redirect) {
      return;
    }

    let cancelled = false;

    const confirmPayment = async () => {
      const api = apiClient(getToken);
      setConfirmingPayment(true);
      try {
        await api.post<UserSubscription>('/billing/toss/confirm', redirect);
        if (cancelled) {
          return;
        }
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
        await load();
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(describeApiError(err, 'billing_confirm'));
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
      } finally {
        if (!cancelled) {
          setConfirmingPayment(false);
        }
      }
    };

    void confirmPayment();

    return () => {
      cancelled = true;
    };
  }, [checkoutResult, getToken, load]);

  const handleCheckout = async (planCode: string) => {
    const api = apiClient(getToken);
    setCheckoutLoading(planCode);
    try {
      const payload = createCheckoutPayload(window.location.href, planCode);
      const checkout = await api.post<BillingCheckoutSession>('/billing/checkout', payload);
      await startTossCheckout(checkout);
    } catch (err) {
      setError(describeApiError(err, 'billing_checkout'));
    } finally {
      setCheckoutLoading(null);
    }
  };

  const currentPlan = plans.find(plan => plan.code === subscription?.planCode) ?? null;

  return (
    <AppShell
      headerActions={
        <>
          <LanguagePicker />
          <Button variant="outline" size="sm" onClick={() => navigate('/session')}>
            {t('nav.sessions')}
          </Button>
        </>
      }
    >
      <HeroSection
        eyebrow={copy.billing.eyebrow}
        title={copy.billing.title}
        description={copy.billing.description}
        actions={
          <>
            <Button
              size="lg"
              className="w-full gap-2 sm:w-auto"
              onClick={() =>
                document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <span>{copy.billing.plansTitle}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/session')}>
              {copy.common.quickPractice}
            </Button>
          </>
        }
        aside={
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-950">
              <Sparkles className="h-4 w-4 text-primary" />
              {copy.billing.currentPlanTitle}
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <MetricCard
                label={isKo ? '활성 플랜' : 'Active plan'}
                value={currentPlan?.displayName ?? (isKo ? '무료' : 'Free')}
                tone="primary"
              />
              <MetricCard
                label={isKo ? '결제 상태' : 'Billing status'}
                value={subscription?.status ?? (isKo ? '미구독' : 'Not subscribed')}
              />
              <MetricCard
                label={isKo ? '다음 행동' : 'Best next step'}
                value={
                  subscription
                    ? isKo
                      ? '플랜 유지 또는 업그레이드'
                      : 'Stay or upgrade'
                    : isKo
                    ? '첫 유료 플랜 시작'
                    : 'Start your first paid plan'
                }
              />
            </div>
          </div>
        }
      />

      {checkoutResult === 'success' && confirmingPayment && (
        <StatusBanner>{isKo ? '결제를 확인하는 중입니다...' : 'Confirming payment...'}</StatusBanner>
      )}
      {checkoutResult === 'success' && !confirmingPayment && !error && (
        <StatusBanner tone="success">
          {t('billing.checkoutSuccess', {
            plan: checkoutPlan ? t('billing.checkoutSuccessPlan', { plan: checkoutPlan }) : ''
          })}
        </StatusBanner>
      )}
      {checkoutResult === 'cancel' && <StatusBanner>{t('billing.checkoutCancelled')}</StatusBanner>}
      {error && <StatusBanner tone="danger">{error}</StatusBanner>}

      <PageHeader
        eyebrow={copy.billing.currentPlanTitle}
        title={copy.billing.plansTitle}
        description={copy.billing.plansDescription}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {t('billing.reload')}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <SectionCard title={copy.billing.currentPlanTitle} description={copy.billing.currentPlanDescription}>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : subscription && currentPlan ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{currentPlan.displayName}</Badge>
                <Badge variant="outline">{subscription.status}</Badge>
                {subscription.cancelAtPeriodEnd && (
                  <Badge variant="destructive">{t('billing.cancelsAtPeriodEnd')}</Badge>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label={isKo ? '포함 분수' : 'Included minutes'}
                  value={`${currentPlan.includedMinutes}`}
                  detail={isKo ? '월 기준' : 'per month'}
                />
                <MetricCard
                  label={isKo ? '최대 세션 시간' : 'Max session'}
                  value={`${currentPlan.maxSessionMinutes}m`}
                  detail={isKo ? '한 번에' : 'per call'}
                />
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-sm font-medium text-slate-950">
                  {getPlanPresentation(i18n.language, currentPlan.code).label}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {getPlanPresentation(i18n.language, currentPlan.code).audience}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              title={isKo ? '아직 유료 플랜이 없습니다' : 'No paid plan yet'}
              description={
                isKo
                  ? '무료 체험 후, 연습이 자연스럽게 이어진다고 느껴질 때만 업그레이드하면 됩니다.'
                  : 'Stay on free until the practice rhythm feels worth paying for.'
              }
            />
          )}
        </SectionCard>

        <SectionCard
          title={copy.billing.title}
          description={copy.billing.description}
          className="h-full"
          contentClassName="space-y-5"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {copy.billing.trustPoints.map(point => (
              <div
                key={point}
                className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-700"
              >
                {point}
              </div>
            ))}
          </div>
          <div className="rounded-3xl border border-primary/15 bg-primary/[0.04] px-5 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-950">
              <CreditCard className="h-4 w-4 text-primary" />
              {isKo ? '지금 필요한 만큼만 결제하는 구조' : 'Only pay for the pace you will actually use'}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isKo
                ? '이 화면은 단순한 가격표가 아니라, 당신에게 맞는 연습 리듬을 고르도록 설계되어 있습니다.'
                : 'This page is designed to help you choose a practice rhythm, not just a price point.'}
            </p>
          </div>
        </SectionCard>
      </div>

      <section id="plans" className="grid gap-5 xl:grid-cols-3">
        {loading ? (
          <div className="xl:col-span-3">
            <StatusBanner>{t('billing.loadingPlans')}</StatusBanner>
          </div>
        ) : (
          plans.map(plan => {
            const planCopy = getPlanPresentation(i18n.language, plan.code);
            const isCurrent = subscription?.planCode === plan.code;
            const isRecommended = plan.code === 'basic';

            return (
              <div
                key={plan.code}
                className={cn(
                  'flex h-full flex-col rounded-[30px] border bg-white/95 p-6 shadow-sm',
                  isCurrent && 'border-primary/60 shadow-lg shadow-primary/10',
                  !isCurrent && 'border-white/90',
                  isRecommended && !isCurrent && 'ring-1 ring-amber-200'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
                      {planCopy.label}
                    </div>
                    <h3 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                      {plan.displayName}
                    </h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    {isRecommended && (
                      <Badge className="border-0 bg-amber-500 text-white">
                        {isKo ? '추천' : 'Recommended'}
                      </Badge>
                    )}
                    {isCurrent && <Badge>{t('billing.currentPlan')}</Badge>}
                  </div>
                </div>

                <div className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
                  {plan.priceKrw > 0 ? `₩${plan.priceKrw.toLocaleString()}` : t('billing.free')}
                  {plan.priceKrw > 0 && (
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      {t('billing.perMonth')}
                    </span>
                  )}
                </div>

                <p className="mt-3 min-h-[48px] text-sm leading-6 text-muted-foreground">
                  {planCopy.audience}
                </p>

                <div className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <MetricCard
                    label={isKo ? '포함 분수' : 'Included minutes'}
                    value={`${plan.includedMinutes}`}
                    detail={isKo ? '월 기준' : 'per month'}
                  />
                  <MetricCard
                    label={isKo ? '세션 길이' : 'Session length'}
                    value={`${plan.maxSessionMinutes}m`}
                    detail={isKo ? '최대 기준' : 'max length'}
                  />
                </div>

                <div className="mt-5 space-y-2">
                  {planCopy.highlights.map(item => (
                    <div key={item} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>

                <Button
                  className="mt-6 w-full"
                  size="lg"
                  variant={isCurrent ? 'secondary' : 'default'}
                  onClick={() => void handleCheckout(plan.code)}
                  disabled={checkoutLoading === plan.code || confirmingPayment}
                >
                  {checkoutLoading === plan.code
                    ? t('billing.processing')
                    : isCurrent
                    ? t('billing.currentPlan')
                    : t('billing.upgradeTo', { name: plan.displayName })}
                </Button>
              </div>
            );
          })
        )}
      </section>
    </AppShell>
  );
}
