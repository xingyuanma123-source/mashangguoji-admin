import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ServiceStaffSession } from '@/types/database';
import { getAdminSession, logoutAdminSession } from '@/lib/adminSession';
import { PROXY_SESSION_EXPIRED_EVENT } from '@/lib/proxySession';

interface AuthContextType {
  user: ServiceStaffSession | null;
  login: (user: ServiceStaffSession) => void;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ServiceStaffSession | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getAdminSession()
      .then((sessionUser) => {
        if (!cancelled) setUser(sessionUser);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => setUser(null);
    window.addEventListener(PROXY_SESSION_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(PROXY_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  const login = (userData: ServiceStaffSession) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await logoutAdminSession();
    } finally {
      setUser(null);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
