import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserSubscription, BillingPlan } from '@lingua/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../components/ui/cn';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError } from '../lib/api';
import LanguagePicker from '../components/ui/LanguagePicker';

export default function ScreenBilling() {
  const { t } = useTranslation();
  const { getToken } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const checkoutResult = searchParams.get('checkout') as 'success' | 'cancel' | null;
  const checkoutProvider = searchParams.get('provider');
  const checkoutPlan = searchParams.get('plan');

  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState('auto');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const buildReturnUrl = (result: 'success' | 'cancel', prov: string, planCode: string) => {
    const base = window.location.href.split('#')[0];
    return `${base}#/billing?checkout=${encodeURIComponent(result)}&provider=${encodeURIComponent(prov)}&plan=${encodeURIComponent(planCode)}`;
  };

  const load = async () => {
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
  };

  useEffect(() => {
    void load();
    if (checkoutProvider) setProvider(checkoutProvider);
  }, []);

  useEffect(() => {
    if (!checkoutResult) return;
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('provider');
    next.delete('plan');
    const timeout = window.setTimeout(() => {
      setSearchParams(next, { replace: true });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [checkoutResult, searchParams, setSearchParams]);

  const handleCheckout = async (planCode: string) => {
    const api = apiClient(getToken);
    setCheckoutLoading(planCode);
    try {
      const payload: { planCode: string; provider?: string; returnUrl: string; cancelUrl: string } =
        {
          planCode,
          returnUrl: buildReturnUrl('success', provider, planCode),
          cancelUrl: buildReturnUrl('cancel', provider, planCode)
        };
      if (provider !== 'auto') payload.provider = provider;
      const checkout = await api.post<{ checkoutUrl: string }>('/billing/checkout', payload);
      window.location.href = checkout.checkoutUrl;
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

        {checkoutResult === 'success' && (
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

        {/* Provider selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground whitespace-nowrap">
            {t('billing.paymentProvider')}
          </label>
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={provider}
            onChange={e => setProvider(e.target.value)}
          >
            <option value="auto">{t('billing.providerAuto')}</option>
            <option value="stripe">{t('billing.providerStripe')}</option>
            <option value="mock">{t('billing.providerMock')}</option>
          </select>
        </div>

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
                        disabled={checkoutLoading === plan.code}
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
