import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import * as Sentry from '@sentry/react';
import App from './App';
import './styles.css';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.2
  });
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required');
}

const ErrorFallback = () => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <p>문제가 발생했습니다. 새로고침해주세요.</p>
    <button onClick={() => window.location.reload()}>새로고침</button>
  </div>
);

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <HashRouter>
          <App />
        </HashRouter>
      </ClerkProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
