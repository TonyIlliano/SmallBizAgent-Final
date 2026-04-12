import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, setToken, clearToken } from '../api/client';
import { mobileLogin, LoginResponse } from '../api/auth';
import { apiRequest } from '../api/client';
import { clearAllCache } from '../db/offlineDb';

interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
  businessId: number | null;
}

interface AuthBusiness {
  id: number;
  name: string;
  industry: string | null;
  timezone: string;
  phone: string | null;
  logoUrl: string | null;
  brandColor: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  business: AuthBusiness | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [business, setBusiness] = useState<AuthBusiness | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for saved token on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          // Validate token by fetching user info
          const userData = await apiRequest<any>('GET', '/api/user');
          setUser({
            id: userData.id,
            username: userData.username,
            email: userData.email,
            role: userData.role,
            businessId: userData.businessId,
          });
          // Fetch business info if available
          if (userData.businessId) {
            try {
              const bizData = await apiRequest<any>('GET', `/api/business/${userData.businessId}`);
              setBusiness({
                id: bizData.id,
                name: bizData.name,
                industry: bizData.industry,
                timezone: bizData.timezone,
                phone: bizData.phone,
                logoUrl: bizData.logoUrl,
                brandColor: bizData.brandColor,
              });
            } catch {
              // Business fetch failed — user might not have one
            }
          }
        }
      } catch {
        // Token invalid — clear it
        await clearToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResponse> => {
    const result = await mobileLogin(email, password);
    if (result.token) {
      await setToken(result.token);
      setUser(result.user);
      setBusiness(result.business);
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    try {
      clearAllCache();
    } catch {
      // SQLite cleanup is best-effort
    }
    setUser(null);
    setBusiness(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, business, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
