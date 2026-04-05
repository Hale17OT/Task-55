import { APIRequestContext } from '@playwright/test';

const BASE = process.env.API_URL || 'http://localhost:3100';

export async function login(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${BASE}/api/v1/auth/login`, {
    data: { username, password },
  });
  const body = await res.json();
  // refreshToken is in httpOnly cookie (not in body); accessToken is in both body and cookie
  return { token: body.accessToken, status: res.status() };
}

export async function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Seed account credentials
export const ACCOUNTS = {
  admin: { username: 'admin', password: 'AdminPass123!@' },
  ops: { username: 'ops_user', password: 'OpsUserPass123!@' },
  merchant: { username: 'merchant1', password: 'MerchantPass123!@' },
  client: { username: 'client1', password: 'ClientPass123!@' },
};
