import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { UserProvider, useUser } from './context/UserContext';
import ScreenLogin from './pages/ScreenLogin';
import ScreenVerify from './pages/ScreenVerify';
import ScreenSession from './pages/ScreenSession';
import ScreenBilling from './pages/ScreenBilling';
import ScreenReport from './pages/ScreenReport';
import ScreenPrivacy from './pages/ScreenPrivacy';
import ScreenTerms from './pages/ScreenTerms';

function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 flex justify-center gap-4 py-2 text-xs text-muted-foreground bg-background/80 backdrop-blur">
      <Link to="/privacy" className="hover:underline">개인정보처리방침</Link>
      <Link to="/terms" className="hover:underline">이용약관</Link>
    </footer>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, sessionChecked } = useUser();
  if (!sessionChecked) return null;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function VerifyGate() {
  const { isAuthenticated, sessionChecked } = useUser();
  if (!sessionChecked) return null;
  if (isAuthenticated) return <Navigate to="/session" replace />;
  return <ScreenVerify />;
}

export default function App() {
  return (
    <UserProvider>
      <Routes>
        <Route path="/" element={<ScreenLogin />} />
        <Route path="/verify" element={<VerifyGate />} />
        <Route path="/session" element={<AuthGate><ScreenSession /></AuthGate>} />
        <Route path="/billing" element={<AuthGate><ScreenBilling /></AuthGate>} />
        <Route path="/report/:reportId" element={<AuthGate><ScreenReport /></AuthGate>} />
        <Route path="/privacy" element={<ScreenPrivacy />} />
        <Route path="/terms" element={<ScreenTerms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </UserProvider>
  );
}
