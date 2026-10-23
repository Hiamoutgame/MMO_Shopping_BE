import { test, expect } from '../fixtures/auth.fixture';
import { unwrap, type ApiClient } from '../helpers/api-client';
import { decodeJwt, loginAdmin, nowSeconds, signJwt } from '../helpers/auth';
import { DAY, isoFromNow, randomId, uniq } from '../helpers/test-data';

/**
 * H. Seasons RBAC.
 * src/modules/seasons/controllers/seasons.controller.ts guards its mutations
 * with RolesGuard only. RolesGuard verifies the JWT signature and reads the
 * account role, but never checks the auth session (BUG-006).
 */
function seasonBody(overrides: Record<string, unknown> = {}) {
  return {
    name: uniq('season'),
    slug: uniq('season').replace(/_/g, '-'),
    description: 'e2e season',
    startDate: isoFromNow(-DAY),
    endDate: isoFromNow(DAY),
    ...overrides,
  };
}

test.describe('H. Seasons RBAC and session revocation', () => {
  const createdSlugs: string[] = [];

  async function track<T extends { slug: string }>(body: T): Promise<T> {
    createdSlugs.push(body.slug);
    return body;
  }

  async function cleanup(anon: ApiClient) {
    if (!createdSlugs.length) return;
    const admin = await loginAdmin(anon);
    for (const slug of createdSlugs.splice(0)) {
      const found = await admin.api.get(`v1/seasons/by-slug/${slug}`);
      if (found.status === 200) {
        await admin.api.delete(`v1/seasons/${unwrap(found.body).id}`);
      }
    }
  }

  test.afterEach(async ({ anon }) => {
    await cleanup(anon);
  });

  test('public reads are open; mutations need a token', async ({ anon }) => {
    expect((await anon.get('v1/seasons')).status).toBe(200);
    expect((await anon.get('v1/seasons/active')).status).toBe(200);

    const body = await track(seasonBody());
    expect((await anon.post('v1/seasons', body)).status).toBe(401);
    expect((await anon.patch(`v1/seasons/${randomId()}`, {})).status).toBe(401);
    expect((await anon.delete(`v1/seasons/${randomId()}`)).status).toBe(401);
    for (const action of ['activate', 'pause', 'end', 'archive']) {
      expect(
        (await anon.post(`v1/seasons/${randomId()}/${action}`)).status,
        action,
      ).toBe(401);
    }
  });

  test('USER and SELLER cannot mutate seasons', async ({ userA, seller }) => {
    for (const session of [userA, seller]) {
      const body = await track(seasonBody());
      expect((await session.api.post('v1/seasons', body)).status).toBe(403);
      expect(
        (await session.api.patch(`v1/seasons/${randomId()}`, {})).status,
      ).toBe(403);
      expect(
        (await session.api.delete(`v1/seasons/${randomId()}`)).status,
      ).toBe(403);
    }
  });

  test('ADMIN can run the season lifecycle', async ({ admin }) => {
    const body = await track(seasonBody());
    const created = await admin.api.post('v1/seasons', body);
    expect(created.status).toBe(201);
    const season = unwrap(created.body);
    expect(season).toMatchObject({ slug: body.slug, status: 'DRAFT' });

    const updated = await admin.api.patch(`v1/seasons/${season.id}`, {
      name: `${body.name}-renamed`,
    });
    expect(updated.status).toBe(200);
    expect(unwrap(updated.body).name).toBe(`${body.name}-renamed`);

    const activated = await admin.api.post(`v1/seasons/${season.id}/activate`);
    expect([200, 201]).toContain(activated.status);
    expect(unwrap(activated.body).status).toBe('ACTIVE');

    const deleted = await admin.api.delete(`v1/seasons/${season.id}`);
    expect([200, 204]).toContain(deleted.status);
    expect((await admin.api.get(`v1/seasons/${season.id}`)).status).toBe(404);
  });

  test('season date range is validated', async ({ admin }) => {
    const body = await track(
      seasonBody({ startDate: isoFromNow(DAY), endDate: isoFromNow(-DAY) }),
    );
    expect((await admin.api.post('v1/seasons', body)).status).toBe(400);
  });

  test('BUG-006: a logged-out admin token must be rejected on every season mutation', async ({
    admin,
  }) => {
    const body = await track(seasonBody());
    const created = await admin.api.post('v1/seasons', body);
    expect(created.status).toBe(201);
    const seasonId = unwrap(created.body).id;

    // Revoke the session. Guarded admin controllers reject the token now.
    expect((await admin.api.post('v1/auth/logout', {})).status).toBe(201);
    expect((await admin.api.get('v1/auth/me')).status).toBe(401);
    expect((await admin.api.get('v1/admin/accounts')).status).toBe(401);

    const revoked = admin.api;
    const second = await track(seasonBody());
    expect
      .soft((await revoked.post('v1/seasons', second)).status, 'create')
      .toBe(401);
    expect
      .soft(
        (await revoked.patch(`v1/seasons/${seasonId}`, { name: uniq('pwn') }))
          .status,
        'update',
      )
      .toBe(401);
    for (const action of ['activate', 'pause', 'end', 'archive']) {
      expect
        .soft((await revoked.post(`v1/seasons/${seasonId}/${action}`)).status, action)
        .toBe(401);
    }
    expect
      .soft((await revoked.delete(`v1/seasons/${seasonId}`)).status, 'delete')
      .toBe(401);
  });

  test('BUG-006: a signed token without sessionId must be rejected on season mutations', async ({
    admin,
    anon,
  }) => {
    const body = await track(seasonBody());
    const created = await admin.api.post('v1/seasons', body);
    expect(created.status).toBe(201);
    const seasonId = unwrap(created.body).id;

    const { sessionId: _sessionId, ...claims } = decodeJwt(admin.accessToken);
    const sessionless = anon.as(
      signJwt({ ...claims, exp: nowSeconds() + 600 }),
    );
    // JwtAuthGuard rejects it everywhere else.
    expect((await sessionless.get('v1/auth/me')).status).toBe(401);

    const result = await sessionless.patch(`v1/seasons/${seasonId}`, {
      description: 'changed without a session',
    });
    expect(result.status).toBe(401);
  });

  test('BUG-005: season create/update reject unknown and non-writable fields', async ({
    admin,
  }) => {
    const body = await track(seasonBody({ hacked: true }));
    const created = await admin.api.post('v1/seasons', body);
    expect.soft(created.status, 'unknown field on create').toBe(400);

    const valid = await track(seasonBody());
    const season = unwrap((await admin.api.post('v1/seasons', valid)).body);
    const patched = await admin.api.patch(`v1/seasons/${season.id}`, {
      createdAt: '2000-01-01T00:00:00.000Z',
    });
    expect.soft(patched.status, 'createdAt on update').toBe(400);

    const missing = await admin.api.post('v1/seasons', {
      slug: (await track(seasonBody())).slug,
    });
    expect.soft(missing.status, 'missing required fields').toBe(400);
  });
});
