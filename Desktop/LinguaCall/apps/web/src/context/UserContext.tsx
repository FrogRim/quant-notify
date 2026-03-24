import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import i18n, { getCachedUiLanguage, setCachedUiLanguage, type UiLanguageCode } from '../i18n';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type UserContextValue = {
  getToken: () => Promise<string | null>;
  isAuthenticated: boolean;
  sessionChecked: boolean;
  refreshSession: () => Promise<void>;
  uiLanguage: UiLanguageCode;
  setUiLanguage: (lang: UiLanguageCode) => Promise<void>;
  clearIdentity: () => Promise<void>;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [uiLanguage, setUiLanguageState] = useState<UiLanguageCode>(getCachedUiLanguage);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const getToken = useCallback(async () => null, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include'
      });
      const payload = await res.json().catch(() => null) as { ok?: boolean } | null;
      setIsAuthenticated(Boolean(payload?.ok && res.ok));
    } catch {
      setIsAuthenticated(false);
    } finally {
      setSessionChecked(true);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const setUiLanguage = useCallback(async (lang: UiLanguageCode) => {
    setUiLanguageState(lang);
    setCachedUiLanguage(lang);
    await i18n.changeLanguage(lang);

    try {
      const token = await getToken();
      await fetch(`${API_BASE}/users/me/ui-language`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ uiLanguage: lang })
      });
    } catch {
      // silent — localStorage already updated, DB sync is best-effort
    }
  }, [getToken]);

  const clearIdentity = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      // best-effort logout
    }
    setIsAuthenticated(false);
    setSessionChecked(true);
    window.location.hash = '#/';
  }, []);

  return (
    <UserContext.Provider value={{ getToken, isAuthenticated, sessionChecked, refreshSession, uiLanguage, setUiLanguage, clearIdentity }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
