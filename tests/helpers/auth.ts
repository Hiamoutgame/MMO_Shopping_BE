import { createHmac } from 'crypto';
import { expect } from '@playwright/test';
import { ApiClient, expectEnvelope } from './api-client';
import { rand, uniqEmail } from './test-data';

export interface Session {
  email: string;
  password: string;
  accountId: string;
  accessToken: string;
  refreshToken: string;
  /** Client bound to this session's access token. */
  api: ApiClient;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env "${key}" (expected in .env.test)`);
  }
  return value;
}

export function newPassword(): string {
  return `E2e!${rand(8)}`;
}

export async function registerUser(
  anon: ApiClient,
  label = 'user',
): Promise<Session> {
  const email = uniqEmail(label);
  const password = newPassword();
  const result = await anon.post('v1/auth/register', {
    email,
    password,
    displayName: `e2e ${label}`,
  });
  const data = expectEnvelope(result, 201);
  return {
    email,
    password,
    accountId: data.account.id,
    accessToken: data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    api: anon.as(data.tokens.accessToken),
  };
}

export async function login(
  anon: ApiClient,
  email: string,
  password: string,
): Promise<Session> {
  const result = await anon.post('v1/auth/login', { email, password });
  const data = expectEnvelope(result, 201);
  return {
    email,
    password,
    accountId: data.account.id,
    accessToken: data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    api: anon.as(data.tokens.accessToken),
  };
}

/** Admin credentials come from .env.test; they are never logged. */
export async function loginAdmin(anon: ApiClient): Promise<Session> {
  const session = await login(
    anon,
    requireEnv('SEED_ADMIN_EMAIL').toLowerCase(),
    requireEnv('SEED_ADMIN_PASSWORD'),
  );
  const me = await session.api.get('v1/auth/me');
  expect(expectEnvelope(me, 200).role.code).toBe('ADMIN');
  return session;
}

/** Creates an account with the given role through the admin API and logs in. */
export async function createAccountWithRole(
  anon: ApiClient,
  admin: ApiClient,
  roleCode: 'USER' | 'SELLER' | 'ADMIN',
): Promise<Session> {
  const email = uniqEmail(roleCode.toLowerCase());
  const password = newPassword();
  const created = await admin.post('v1/admin/accounts', {
    email,
    password,
    roleCode,
    displayName: `e2e ${roleCode.toLowerCase()}`,
  });
  expectEnvelope(created, 201);
  return login(anon, email, password);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Signs an HS256 JWT. With no explicit secret it uses the real JWT_SECRET from
 * .env.test so tests can craft expired tokens or tokens with missing claims.
 */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string = requireEnv('JWT_SECRET'),
): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(
    createHmac('sha256', secret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${signature}`;
}

export function decodeJwt(token: string): Record<string, any> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
