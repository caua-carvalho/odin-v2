/** ODIN V2 — Auth context.

 * Responsabilidade: gerenciar autenticação do operador (login/logout) e manter
 * o estado de usuário disponível para toda a aplicação.
 *
 * O estado é originário dos tokens armazenados no SecureStore, verificados
 * contra o backend na inicialização.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, type UserResponse } from '../services/api';

interface AuthContextValue {
  user: UserResponse | null;
  loading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const { accessToken, refreshToken } = await api.loadTokens();
      if (!accessToken) {
        setLoading(false);
        return;
      }

      try {
        // Força um refresh para validar os tokens salvos.
        await api.refreshAccessToken();
        const user = await api.getMe();
        if (mounted) setUser(user);
      } catch {
        // Falha de autenticação — apaga tokens e segue sem usuário.
        await api.clearTokens();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user, tokens } = await api.login(email, password);
    await api.saveTokens(tokens.accessToken, tokens.refreshToken);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await api.clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isLoggedIn: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
