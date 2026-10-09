import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope, expectNoSensitiveFields } from '../helpers/api-client';
import {
  decodeJwt,
  login,
  newPassword,
  nowSeconds,
  registerUser,
  signJwt,
} from '../helpers/auth';
import { dbQuery } from '../helpers/db';
import { uniqEmail } from '../helpers/test-data';

test.describe('A. Authentication flow', () => {
  test('register creates a USER account with tokens, cart and wallet', async ({
    anon,
  }) => {
    const email = uniqEmail('register');
    const result = await anon.post('v1/auth/register', {
      email,
      password: newPassword(),
    });
    const data = expectEnvelope(result, 201);
    expect(data.account).toMatchObject({
      email,
      role: 'USER',
      status: 'ACTIVE',
    });
    expect(data.tokens.accessToken).toEqual(expect.any(String));
    expect(data.tokens.refreshToken).toEqual(expect.any(String));
    expect(data.tokens.expiresIn).toBeGreaterThan(0);
    expectNoSensitiveFields(result.body);

    // Database state: account, cart, wallet and one live session exist.
    const [row] = await dbQuery<{
      carts: string;
      wallets: string;
      sessions: string;
      balance: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM carts WHERE account_id = a.id) AS carts,
         (SELECT COUNT(*) FROM wallets WHERE account_id = a.id) AS wallets,
         (SELECT COUNT(*) FROM auth_sessions
            WHERE account_id = a.id AND revoked_at IS NULL) AS sessions,
         (SELECT balance FROM wallets WHERE account_id = a.id) AS balance
       FROM accounts a WHERE a.id = $1`,
      [data.account.id],
    );
    expect(Number(row.carts)).toBe(1);
    expect(Number(row.wallets)).toBe(1);
    expect(Number(row.sessions)).toBe(1);
    expect(Number(row.balance)).toBe(0);
  });

  test('login succeeds and /auth/me returns the profile', async ({
    anon,
    userA,
  }) => {
    const session = await login(anon, userA.email, userA.password);
    expect(session.accountId).toBe(userA.accountId);

    const me = await session.api.get('v1/auth/me');
    const data = expectEnvelope(me, 200);
    expect(data).toMatchObject({
      id: userA.accountId,
      email: userA.email,
      status: 'ACTIVE',
    });
    expect(data.role.code).toBe('USER');
    expectNoSensitiveFields(me.body);
  });

  test('email is case-insensitive for login', async ({ anon, userA }) => {
    const result = await anon.post('v1/auth/login', {
      email: userA.email.toUpperCase(),
      password: userA.password,
    });
    expectEnvelope(result, 201);
  });

  test('login with a wrong password is rejected', async ({ anon, userA }) => {
    const result = await anon.post('v1/auth/login', {
      email: userA.email,
      password: `${userA.password}x`,
    });
    expect(result.status).toBe(401);
    expect(JSON.stringify(result.body)).not.toContain('accessToken');
  });

  test('login for an unknown email is rejected with the same status', async ({
    anon,
  }) => {
    const result = await anon.post('v1/auth/login', {
      email: uniqEmail('ghost'),
      password: newPassword(),
    });
    expect(result.status).toBe(401);
  });

  test('registering a duplicate email is rejected', async ({ anon, userA }) => {
    const result = await anon.post('v1/auth/register', {
      email: userA.email.toUpperCase(),
      password: newPassword(),
    });
    expect(result.status).toBe(409);
  });

  test('register validates email, password length and unknown fields', async ({
    anon,
  }) => {
    const badEmail = await anon.post('v1/auth/register', {
      email: 'not-an-email',
      password: newPassword(),
    });
    expect(badEmail.status).toBe(400);

    const shortPassword = await anon.post('v1/auth/register', {
      email: uniqEmail('short'),
      password: '123',
    });
    expect(shortPassword.status).toBe(400);

    // A client must not be able to choose its own role.
    const extraField = await anon.post('v1/auth/register', {
      email: uniqEmail('extra'),
      password: newPassword(),
      roleCode: 'ADMIN',
    });
    expect(extraField.status).toBe(400);
  });

  test('refresh rotates the token and rejects the old refresh token', async ({
    anon,
    userA,
  }) => {
    const first = await anon.post('v1/auth/refresh', {
      refreshToken: userA.refreshToken,
    });
    const rotated = expectEnvelope(first, 201);
    expect(rotated.refreshToken).not.toBe(userA.refreshToken);
    expect(rotated.accessToken).not.toBe(userA.accessToken);

    // The new access token works, the old session is gone.
    expect((await anon.as(rotated.accessToken).get('v1/auth/me')).status).toBe(
      200,
    );
    expect((await userA.api.get('v1/auth/me')).status).toBe(401);

    // Re-using the rotated refresh token is rejected...
    const reuse = await anon.post('v1/auth/refresh', {
      refreshToken: userA.refreshToken,
    });
    expect(reuse.status).toBe(401);

    // ...and reuse detection revokes the whole token family.
    expect((await anon.as(rotated.accessToken).get('v1/auth/me')).status).toBe(
      401,
    );
    const afterReuse = await anon.post('v1/auth/refresh', {
      refreshToken: rotated.refreshToken,
    });
    expect(afterReuse.status).toBe(401);
  });

  test('refresh with an unknown token is rejected', async ({ anon }) => {
    const result = await anon.post('v1/auth/refresh', {
      refreshToken: 'f'.repeat(80),
    });
    expect(result.status).toBe(401);
  });

  test('logout revokes the current session', async ({ anon, userA }) => {
    expect((await userA.api.get('v1/auth/me')).status).toBe(200);

    const result = await userA.api.post('v1/auth/logout', {});
    expectEnvelope(result, 201);

    for (const path of ['v1/auth/me', 'v1/cart', 'v1/wallet', 'v1/orders']) {
      expect((await userA.api.get(path)).status, path).toBe(401);
    }
    // The refresh token of a logged-out session must not mint new tokens.
    const refresh = await anon.post('v1/auth/refresh', {
      refreshToken: userA.refreshToken,
    });
    expect(refresh.status).toBe(401);

    const sessionId = decodeJwt(userA.accessToken).sessionId;
    const [row] = await dbQuery<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM auth_sessions WHERE id = $1',
      [sessionId],
    );
    expect(row.revoked_at).not.toBeNull();
  });

  test('logout-all revokes every session of the account', async ({
    anon,
    userA,
  }) => {
    const second = await login(anon, userA.email, userA.password);
    const third = await login(anon, userA.email, userA.password);

    const result = await second.api.post('v1/auth/logout-all', {});
    const data = expectEnvelope(result, 201);
    expect(data.revokedCount).toBe(3);

    for (const session of [userA, second, third]) {
      expect((await session.api.get('v1/auth/me')).status).toBe(401);
    }
    const [row] = await dbQuery<{ live: string }>(
      `SELECT COUNT(*) AS live FROM auth_sessions
       WHERE account_id = $1 AND revoked_at IS NULL`,
      [userA.accountId],
    );
    expect(Number(row.live)).toBe(0);
  });

  test('logout-all does not touch other accounts', async ({ userA, userB }) => {
    await userA.api.post('v1/auth/logout-all', {});
    expect((await userB.api.get('v1/auth/me')).status).toBe(200);
  });

  test.describe('token validation', () => {
    test('missing or malformed Authorization header', async ({ anon }) => {
      expect((await anon.get('v1/auth/me')).status).toBe(401);
      expect((await anon.as('not-a-jwt').get('v1/auth/me')).status).toBe(401);
      const basic = await anon.get('v1/auth/me', {
        headers: { Authorization: 'Basic abc' },
      });
      expect(basic.status).toBe(401);
    });

    test('token with a wrong signature', async ({ anon, userA }) => {
      const payload = decodeJwt(userA.accessToken);
      const forged = signJwt(payload, 'e2e-wrong-secret');
      expect((await anon.as(forged).get('v1/auth/me')).status).toBe(401);

      const [header, body] = userA.accessToken.split('.');
      const unsigned = `${header}.${body}.`;
      expect((await anon.as(unsigned).get('v1/auth/me')).status).toBe(401);
    });

    test('"alg: none" token is rejected', async ({ anon, userA }) => {
      const payload = decodeJwt(userA.accessToken);
      const b64 = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
      expect((await anon.as(token).get('v1/auth/me')).status).toBe(401);
    });

    test('expired token with a valid signature', async ({ anon, userA }) => {
      const payload = decodeJwt(userA.accessToken);
      const expired = signJwt({
        ...payload,
        iat: nowSeconds() - 3600,
        exp: nowSeconds() - 60,
      });
      expect((await anon.as(expired).get('v1/auth/me')).status).toBe(401);
    });

    test('validly signed token without sessionId', async ({ anon, userA }) => {
      const { sessionId: _sessionId, ...rest } = decodeJwt(userA.accessToken);
      const token = signJwt({ ...rest, exp: nowSeconds() + 600 });
      expect((await anon.as(token).get('v1/auth/me')).status).toBe(401);
    });

    test('validly signed token whose session belongs to another account', async ({
      anon,
      userA,
      userB,
    }) => {
      const victim = decodeJwt(userB.accessToken);
      const mine = decodeJwt(userA.accessToken);
      const token = signJwt({
        ...victim,
        sessionId: mine.sessionId,
        exp: nowSeconds() + 600,
      });
      expect((await anon.as(token).get('v1/auth/me')).status).toBe(401);
    });
  });

  test('register does not expose a session for a different account', async ({
    anon,
  }) => {
    const one = await registerUser(anon, 'iso1');
    const two = await registerUser(anon, 'iso2');
    const meOne = expectEnvelope(await one.api.get('v1/auth/me'), 200);
    const meTwo = expectEnvelope(await two.api.get('v1/auth/me'), 200);
    expect(meOne.id).toBe(one.accountId);
    expect(meTwo.id).toBe(two.accountId);
    expect(meOne.id).not.toBe(meTwo.id);
  });
});
