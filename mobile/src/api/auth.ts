import { API_BASE_URL } from '../config';

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    businessId: number | null;
    emailVerified: boolean;
  };
  business: {
    id: number;
    name: string;
    industry: string | null;
    timezone: string;
    phone: string | null;
    logoUrl: string | null;
    brandColor: string | null;
  } | null;
  requiresTwoFactor?: boolean;
}

export async function mobileLogin(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/mobile-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }

  return response.json();
}

export async function refreshToken(currentToken: string): Promise<{ token: string }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/mobile-refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  return response.json();
}
