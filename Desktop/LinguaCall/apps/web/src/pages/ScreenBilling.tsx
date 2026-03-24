import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserSubscription, BillingPlan, BillingCheckoutSession } from '@lingua/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../components/ui/cn';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError } from '../lib/api';
import LanguagePicker from '../components/ui/LanguagePicker';
import {
  createCheckoutPayload,
  readTossRedirectParams
} from '../features/billing/checkout';
import { startTossCheckout } from '../features/billing/toss';

export default function ScreenBilling() {
  const { t } = useTranslation();
  const { getToken } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold tracking-tighter text-foreground">{t('common.appName')}</h1>
          <div className="flex items-center gap-2">
            <LanguagePicker />
            <Button variant="outline" size="sm" onClick={() => navigate('/session')}>
              {t('nav.sessions')}
            </Button>
          </div>
        </div>

        {checkoutResult === 'success' && confirmingPayment && (
          <div className="rounded-md bg-secondary border border-border px-3 py-2 text-sm text-secondary-foreground">
            confirming payment...
          </div>
        )}
        {checkoutResult === 'success' && !confirmingPayment && !error && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            {t('billing.checkoutSuccess', {
              plan: checkoutPlan ? t('billing.checkoutSuccessPlan', { plan: checkoutPlan }) : ''
            })}
          </div>
        )}
        {checkoutResult === 'cancel' && (
          <div className="rounded-md bg-secondary border border-border px-3 py-2 text-sm text-secondary-foreground">
            {t('billing.checkoutCancelled')}
          </div>
        )}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Current Subscription */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>{t('billing.currentSubscription')}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t('billing.reload')}
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : subscription ? (
              <div className="flex items-center gap-2">
                <Badge>{subscription.planCode}</Badge>
                <Badge variant="outline">{subscription.status}</Badge>
                {subscription.cancelAtPeriodEnd && (
                  <Badge variant="destructive">{t('billing.cancelsAtPeriodEnd')}</Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('billing.noSubscription')}</p>
            )}
          </CardContent>
        </Card>
        {/* Plans */}
        <div>
          <h2 className="text-lg font-semibold tracking-tighter text-foreground mb-4">{t('billing.availablePlans')}</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('billing.loadingPlans')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
              {plans.map(plan => {
                const isCurrent = subscription?.planCode === plan.code;
                return (
                  <Card
                    key={plan.code}
                    className={cn(
                      'flex flex-col transition-all',
                      isCurrent
                        ? 'border-indigo-600 border-2 shadow-md'
                        : 'border-slate-200'
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{plan.displayName}</CardTitle>
                        {isCurrent && (
                          <Badge className="bg-indigo-600 text-white text-xs border-0">
                            {t('billing.currentPlan')}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 flex-1">
                      <div className="text-3xl font-bold tracking-tighter text-foreground">
                        {plan.priceKrw > 0 ? `₩${plan.priceKrw.toLocaleString()}` : t('billing.free')}
                        {plan.priceKrw > 0 && (
                          <span className="text-sm font-normal text-muted-foreground">{t('billing.perMonth')}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex-1">
                        {t('billing.maxSession', { min: plan.maxSessionMinutes })}
                      </div>
                      <Button
                        className="w-full mt-auto"
                        size="sm"
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
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
