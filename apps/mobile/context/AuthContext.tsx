import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { UserRole } from '@suredriver/shared-types';
import { api, setApiToken } from '@/services/api';

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
  fullName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  setSession: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'suredriver_token';
const USER_KEY = 'suredriver_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      const storedUser = await SecureStore.getItemAsync(USER_KEY);
      if (storedToken && storedUser) {
        setApiToken(storedToken);
        try {
          await api.getMe();
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        } catch {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          await SecureStore.deleteItemAsync(USER_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  const setSession = async (newToken: string, newUser: AuthUser) => {
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, token, loading, setSession, signOut }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
