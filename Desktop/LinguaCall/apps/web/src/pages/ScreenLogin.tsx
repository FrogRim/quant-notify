import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageLayout from '../components/layout/PageLayout';
import { Button } from '../components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useUser } from '../context/UserContext';

export default function ScreenLogin() {
  const { t } = useTranslation();
  const { isAuthenticated, sessionChecked } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionChecked && isAuthenticated) {
      navigate('/session');
    }
  }, [isAuthenticated, navigate, sessionChecked]);

  return (
    <PageLayout>
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('login.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
        <Button onClick={() => navigate('/verify')} className="gap-2">
          <span>{t('verify.sendCode')}</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </PageLayout>
  );
}
