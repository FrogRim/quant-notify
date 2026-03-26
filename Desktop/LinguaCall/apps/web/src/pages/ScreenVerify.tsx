import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronLeft, ShieldCheck } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import { CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { StatusBanner } from '../components/layout/SectionCard';
import { getFriendlyCopy } from '../content/friendlyCopy';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError } from '../lib/api';
import { completeVerifiedSession } from '../features/auth/verifyFlow';

export default function ScreenVerify() {
  const { i18n, t } = useTranslation();
  const { getToken, refreshSession } = useUser();
  const navigate = useNavigate();
  const copy = getFriendlyCopy(i18n.language);

  const [phone, setPhone] = useState('+8210');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const api = apiClient(getToken);

  const sendCode = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.post<{ maskedPhone: string; debugCode: string }>(
        '/auth/otp/start',
        { phone }
      );
      setMessage(`Sent to ${result.maskedPhone} (dev code: ${result.debugCode})`);
      setShowOtp(true);
    } catch (err) {
      setError(describeApiError(err, 'phone_start'));
    } finally {
      setLoading(false);
    }
  };

  const confirmCode = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post<{ userId: string; sessionId: string }>('/auth/otp/verify', {
        phone,
        code: otp
      });
      await completeVerifiedSession({
        refreshSession,
        navigate
      });
    } catch (err) {
      setError(describeApiError(err, 'phone_confirm'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={copy.verify.eyebrow}
      title={copy.verify.title}
      description={copy.verify.description}
      sidebarTitle={copy.verify.stepsTitle}
      sidebarCopy={copy.verify.supportCopy}
      sidebarPoints={copy.verify.steps}
    >
      <CardContent className="space-y-8 px-8 py-8 sm:px-10 sm:py-10">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure session
          </div>
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-slate-950">
              {showOtp ? t('verify.confirmCode') : t('verify.sendCode')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {showOtp ? copy.verify.supportTitle : copy.verify.description}
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2">
          <div className={`rounded-2xl px-4 py-3 text-sm ${showOtp ? 'bg-white text-slate-500' : 'bg-slate-950 text-white'}`}>
            1. {t('verify.phoneLabel')}
          </div>
          <div className={`rounded-2xl px-4 py-3 text-sm ${showOtp ? 'bg-slate-950 text-white' : 'bg-white text-slate-500'}`}>
            2. {t('verify.otpLabel')}
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="phone">{t('verify.phoneLabel')}</Label>
            <Input
              id="phone"
              className="h-12 rounded-2xl"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={t('verify.phonePlaceholder')}
              disabled={showOtp}
            />
          </div>

          {!showOtp && (
            <Button onClick={() => void sendCode()} disabled={loading} size="lg" className="w-full gap-2">
              {loading ? (
                t('verify.sending')
              ) : (
                <>
                  <span>{t('verify.sendCode')}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}

          {message && <StatusBanner>{message}</StatusBanner>}

          {showOtp && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="otp">{t('verify.otpLabel')}</Label>
                <Input
                  id="otp"
                  className="h-12 rounded-2xl text-center text-lg tracking-[0.4em]"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  placeholder={t('verify.otpPlaceholder')}
                  maxLength={6}
                  autoFocus
                />
              </div>
              <Button onClick={() => void confirmCode()} disabled={loading} size="lg" className="w-full gap-2">
                {loading ? (
                  t('verify.confirming')
                ) : (
                  <>
                    <span>{t('verify.confirmCode')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {error && <StatusBanner tone="danger">{error}</StatusBanner>}

        <Button
          variant="ghost"
          className="w-full gap-1 text-muted-foreground"
          onClick={() => navigate('/')}
        >
          <ChevronLeft className="h-4 w-4" />
          {t('verify.backToLogin')}
        </Button>
      </CardContent>
    </AuthLayout>
  );
}
