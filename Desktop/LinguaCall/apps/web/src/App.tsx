import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
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

export default function App() {
  return (
    <UserProvider>
      <Routes>
        <Route path="/" element={<ScreenLogin />} />
        <Route path="/verify" element={<ScreenVerify />} />
        <Route path="/session" element={<ScreenSession />} />
        <Route path="/billing" element={<ScreenBilling />} />
        <Route path="/report/:reportId" element={<ScreenReport />} />
        <Route path="/privacy" element={<ScreenPrivacy />} />
        <Route path="/terms" element={<ScreenTerms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </UserProvider>
  );
}
