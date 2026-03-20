import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SignIn, useAuth } from '@clerk/clerk-react';
import PageLayout from '../components/layout/PageLayout';

export default function ScreenLogin() {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn) {
      navigate('/verify');
    }
  }, [isSignedIn, navigate]);

  return (
    <PageLayout>
      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('login.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
        <SignIn routing="hash" />
      </div>
    </PageLayout>
  );
}
