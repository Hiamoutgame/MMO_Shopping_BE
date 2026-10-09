import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope } from '../helpers/api-client';

test.describe('Smoke', () => {
  test('backend is reachable under the /api prefix', async ({ anon }) => {
    const root = await anon.get('');
    expect(root.status).toBe(200);
  });

  test('public catalog responds', async ({ anon }) => {
    expectEnvelope(await anon.get('v1/products'), 200);
    expectEnvelope(await anon.get('v1/categories'), 200);
  });

  test('seeded admin from .env.test can log in', async ({ admin }) => {
    const me = expectEnvelope(await admin.api.get('v1/auth/me'), 200);
    expect(me.role.code).toBe('ADMIN');
  });
});
