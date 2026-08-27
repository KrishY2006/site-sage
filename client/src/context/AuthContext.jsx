import { createContext, useContext, useState, useMemo } from 'react';
import { parseJwt } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('site-sage-token'));

  function login(newToken) {
    localStorage.setItem('site-sage-token', newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem('site-sage-token');
    setToken(null);
  }

  const value = useMemo(() => {
    if (!token) return { token: null, user: null, isAuthenticated: false, login, logout };

    const payload = parseJwt(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('site-sage-token');
      return { token: null, user: null, isAuthenticated: false, login, logout };
    }

    return {
      token,
      user: { id: payload.userId },
      isAuthenticated: true,
      login,
      logout
    };
  }, [token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
