import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserProfile } from '@lingua/shared';
import PageLayout from '../components/layout/PageLayout';
import { CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { apiClient, describeApiError } from '../lib/api';

export default function ScreenVerify() {
  const { t } = useTranslation();
  const { getToken } = useUser();
  const navigate = useNavigate();
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
        '/users/phone/start',
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
      await api.post<UserProfile>('/users/phone/confirm', { phone, code: otp });
      navigate('/session');
    } catch (err) {
      setError(describeApiError(err, 'phone_confirm'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout>
      <CardHeader className="px-8 pt-8 pb-2">
        <CardTitle className="text-xl tracking-tighter">{t('verify.title')}</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{t('verify.subtitle')}</p>
      </CardHeader>
      <CardContent className="px-8 pb-8 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="phone">{t('verify.phoneLabel')}</Label>
          <Input
            id="phone"
            className="h-11"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder={t('verify.phonePlaceholder')}
            disabled={showOtp}
          />
        </div>

        {!showOtp && (
          <Button onClick={() => void sendCode()} disabled={loading} className="w-full gap-2">
            {loading ? t('verify.sending') : <><span>{t('verify.sendCode')}</span><ArrowRight className="w-4 h-4" /></>}
          </Button>
        )}

        {message && (
          <div className="rounded-md bg-secondary border border-border px-4 py-3 text-sm text-secondary-foreground">
            {message}
          </div>
        )}

        {showOtp && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="otp">{t('verify.otpLabel')}</Label>
              <Input
                id="otp"
                className="h-11 tracking-widest text-center text-lg"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder={t('verify.otpPlaceholder')}
                maxLength={6}
                autoFocus
              />
            </div>
            <Button onClick={() => void confirmCode()} disabled={loading} className="w-full gap-2">
              {loading ? t('verify.confirming') : <><span>{t('verify.confirmCode')}</span><ArrowRight className="w-4 h-4" /></>}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button variant="ghost" className="w-full gap-1 text-muted-foreground" onClick={() => navigate('/')}>
          <ChevronLeft className="w-4 h-4" />
          {t('verify.backToLogin')}
        </Button>
      </CardContent>
    </PageLayout>
  );
}
