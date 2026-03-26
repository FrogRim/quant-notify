import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

const ErrorFallback = () => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <p>문제가 발생했습니다. 새로고침 후 다시 시도해주세요.</p>
    <button onClick={() => window.location.reload()}>새로고침</button>
  </div>
);

type ErrorFallbackBoundaryProps = {
  fallback: React.ReactNode;
  children: React.ReactNode;
};

class ErrorFallbackBoundary extends React.Component<
  ErrorFallbackBoundaryProps,
  { hasError: boolean }
> {
  constructor(props: ErrorFallbackBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('web runtime error', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <ErrorFallbackBoundary fallback={<ErrorFallback />}>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorFallbackBoundary>
  </React.StrictMode>
);
