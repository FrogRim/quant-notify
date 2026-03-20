import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import i18n, { getCachedUiLanguage, setCachedUiLanguage, type UiLanguageCode } from '../i18n';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type UserContextValue = {
  clerkUserId: string;
  getToken: () => Promise<string | null>;
  uiLanguage: UiLanguageCode;
  setUiLanguage: (lang: UiLanguageCode) => Promise<void>;
  clearIdentity: () => void;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { userId, getToken } = useAuth();
  const { signOut } = useClerk();

  const [uiLanguage, setUiLanguageState] = useState<UiLanguageCode>(getCachedUiLanguage);

  const clerkUserId = userId ?? '';

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

  const clearIdentity = useCallback(() => {
    void signOut();
  }, [signOut]);

  return (
    <UserContext.Provider value={{ clerkUserId, getToken, uiLanguage, setUiLanguage, clearIdentity }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
