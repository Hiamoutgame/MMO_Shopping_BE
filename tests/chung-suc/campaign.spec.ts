import { test, expect } from '../fixtures/auth.fixture';
import { unwrap, type ApiClient } from '../helpers/api-client';
import { loginAdmin, registerUser, type Session } from '../helpers/auth';
import {
  dbQuery,
  deleteCampaignParticipants,
  setProductPricing,
} from '../helpers/db';
import {
  DAY,
  HOUR,
  createProduct,
  isoFromNow,
  randomId,
  uniq,
} from '../helpers/test-data';

/**
 * G. CHUNG SUC campaigns (src/modules/chung-suc).
 * Legitimate setup always uses the admin token so the same specs keep working
 * once the controller is guarded.
 */
const campaignIds: string[] = [];

function campaignBody(productId: string, overrides: Record<string, unknown> = {}) {
  return {
    productId,
    name: uniq('campaign'),
    slug: uniq('campaign').replace(/_/g, '-'),
    targetQuantity: 10,
    startTime: isoFromNow(-HOUR),
    endTime: isoFromNow(DAY),
    ...overrides,
  };
}

/** `basePrice` is the price of one supporting account; null leaves it unset. */
async function createCampaign(
  admin: ApiClient,
  overrides: Record<string, unknown> = {},
  basePrice: string | null = '10000',
) {
  const product = await createProduct(admin);
  await setProductPricing(product.id, basePrice);
  const result = await admin.post(
    'v1/campaigns',
    campaignBody(product.id, overrides),
  );
  expect(result.status).toBe(201);
  const campaign = unwrap(result.body);
  campaignIds.push(campaign.id);
  return campaign as { id: string; slug: string; status: string; productId: string };
}

async function activeCampaign(
  admin: ApiClient,
  overrides: Record<string, unknown> = {},
  basePrice: string | null = '10000',
) {
  const campaign = await createCampaign(admin, overrides, basePrice);
  const activated = await admin.post(`v1/campaigns/${campaign.id}/activate`);
  expect([200, 201]).toContain(activated.status);
  expect(unwrap(activated.body).status).toBe('ACTIVE');
  return campaign;
}

function inviteCode() {
  return `E2E-INVITE-${randomId()}`;
}

/**
 * Submit an invite code as `session`, naming the session's own account in the
 * body. Each call uses a fresh code unless `extra.inviteCode` says otherwise.
 */
function join(
  session: Session,
  campaignId: string,
  quantity: unknown = 1,
  extra: Record<string, unknown> = {},
) {
  return session.api.post(`v1/campaigns/${campaignId}/join`, {
    accountId: session.accountId,
    inviteCode: inviteCode(),
    quantity,
    ...extra,
  });
}

async function requestStatus(id: string) {
  const [row] = await dbQuery<{ status: string }>(
    'SELECT status FROM chung_suc_participants WHERE id = $1',
    [id],
  );
  return row?.status;
}

async function campaignRow(id: string) {
  const [row] = await dbQuery<{
    status: string;
    target_quantity: number;
    deleted_at: Date | null;
    participants: string;
  }>(
    `SELECT c.status, c.target_quantity, c.deleted_at,
            (SELECT COUNT(*) FROM chung_suc_participants p WHERE p.campaign_id = c.id) AS participants
     FROM chung_suc_campaigns c WHERE c.id = $1`,
    [id],
  );
  return row;
}

test.afterEach(async ({ anon }) => {
  const ids = campaignIds.splice(0);
  if (!ids.length) return;
  await deleteCampaignParticipants(ids);
  const admin = await loginAdmin(anon);
  for (const id of ids) {
    await admin.api.delete(`v1/campaigns/${id}`);
  }
});

test.describe('G. Campaign administration', () => {
  test('ADMIN creates, updates and runs a campaign; public can read it', async ({
    admin,
    anon,
  }) => {
    const campaign = await createCampaign(admin.api, { targetQuantity: 5 });
    expect(campaign.status).toBe('DRAFT');

    const fetched = await anon.get(`v1/campaigns/${campaign.id}`);
    expect(fetched.status).toBe(200);
    expect(unwrap(fetched.body)).toMatchObject({
      id: campaign.id,
      targetQuantity: 5,
    });
    expect(unwrap(fetched.body)).not.toHaveProperty('currentQuantity');
    expect((await anon.get(`v1/campaigns/by-slug/${campaign.slug}`)).status).toBe(200);
    expect((await anon.get('v1/campaigns/active')).status).toBe(200);

    const updated = await admin.api.patch(`v1/campaigns/${campaign.id}`, {
      name: 'e2e renamed',
    });
    expect(updated.status).toBe(200);
    expect(unwrap(updated.body).name).toBe('e2e renamed');

    const activated = await admin.api.post(`v1/campaigns/${campaign.id}/activate`);
    expect(unwrap(activated.body).status).toBe('ACTIVE');
    const active = unwrap((await anon.get('v1/campaigns/active')).body) as any[];
    expect(active.map((entry) => entry.id)).toContain(campaign.id);
  });

  test('a campaign that has not started yet becomes UPCOMING, not ACTIVE', async ({
    admin,
  }) => {
    const campaign = await createCampaign(admin.api, {
      startTime: isoFromNow(HOUR),
      endTime: isoFromNow(DAY),
    });
    const activated = await admin.api.post(`v1/campaigns/${campaign.id}/activate`);
    expect(unwrap(activated.body).status).toBe('UPCOMING');
  });

  test('create validates target quantity, dates, product and slug', async ({
    admin,
  }) => {
    const product = await createProduct(admin.api);
    const attempts: [string, Record<string, unknown>][] = [
      ['targetQuantity = 0', { targetQuantity: 0 }],
      ['targetQuantity < 0', { targetQuantity: -5 }],
      ['start after end', { startTime: isoFromNow(DAY), endTime: isoFromNow(HOUR) }],
      ['start equals end', { startTime: '2030-01-01T00:00:00.000Z', endTime: '2030-01-01T00:00:00.000Z' }],
    ];
    for (const [label, overrides] of attempts) {
      const body = campaignBody(product.id, overrides);
      const result = await admin.api.post('v1/campaigns', body);
      expect.soft(result.status, label).toBe(400);
      if (result.status < 300) campaignIds.push(unwrap(result.body).id);
    }

    const missingProduct = await admin.api.post(
      'v1/campaigns',
      campaignBody(randomId()),
    );
    expect(missingProduct.status).toBe(404);

    const existing = await createCampaign(admin.api);
    const duplicate = await admin.api.post(
      'v1/campaigns',
      campaignBody(product.id, { slug: existing.slug }),
    );
    expect([400, 409]).toContain(duplicate.status);
  });

  test('BUG-005: create/update reject malformed and non-writable fields', async ({
    admin,
  }) => {
    const product = await createProduct(admin.api);
    const malformed: [string, Record<string, unknown>][] = [
      ['unknown field', { hacked: true }],
      ['targetQuantity as string', { targetQuantity: '10' }],
      ['targetQuantity fractional', { targetQuantity: 2.5 }],
      ['non ISO dates', { startTime: 'aaa', endTime: 'zzz' }],
      ['empty name', { name: '' }],
    ];
    for (const [label, overrides] of malformed) {
      const result = await admin.api.post(
        'v1/campaigns',
        campaignBody(product.id, overrides),
      );
      expect.soft(result.status, `create: ${label}`).toBe(400);
      if (result.status < 300) campaignIds.push(unwrap(result.body).id);
    }

    // Mass assignment through PATCH.
    const campaign = await activeCampaign(admin.api, { targetQuantity: 10 });
    const patches: [string, Record<string, unknown>][] = [
      ['currentQuantity', { currentQuantity: 9999 }],
      ['targetQuantity = 0', { targetQuantity: 0 }],
      ['status COMPLETED', { status: 'COMPLETED' }],
      ['productId', { productId: randomId() }],
      ['end before existing start', { endTime: isoFromNow(-DAY) }],
    ];
    for (const [label, body] of patches) {
      const result = await admin.api.patch(`v1/campaigns/${campaign.id}`, body);
      expect.soft(result.status, `patch: ${label}`).toBe(400);
    }
    const row = await campaignRow(campaign.id);
    expect.soft(row.status, 'status only changes through lifecycle endpoints').toBe('ACTIVE');
    expect.soft(row.target_quantity).toBe(10);
  });

  test('BUG-002: anonymous users cannot create a campaign', async ({
    admin,
    anon,
  }) => {
    const product = await createProduct(admin.api);
    const result = await anon.post('v1/campaigns', campaignBody(product.id));
    if (result.status < 300) campaignIds.push(unwrap(result.body).id);
    expect(result.status).toBe(401);
  });

  // Role SELLER đã ngừng (docs/changes/seller-role-disabled-2026-10-23.md):
  // không tạo được account SELLER mới, seller cũ có quyền như USER.
  test('BUG-002: USER cannot create a campaign', async ({ admin, userA }) => {
    const product = await createProduct(admin.api);
    const result = await userA.api.post(
      'v1/campaigns',
      campaignBody(product.id),
    );
    if (result.status < 300) campaignIds.push(unwrap(result.body).id);
    expect(result.status).toBe(403);
  });

  test('BUG-002: anonymous users cannot update, run or delete a campaign', async ({
    admin,
    anon,
  }) => {
    const campaign = await createCampaign(admin.api);
    const id = campaign.id;

    expect
      .soft((await anon.patch(`v1/campaigns/${id}`, { name: 'pwned' })).status, 'update')
      .toBe(401);
    for (const action of ['activate', 'pause', 'end', 'close']) {
      expect.soft((await anon.post(`v1/campaigns/${id}/${action}`)).status, action).toBe(401);
    }
    expect.soft((await anon.delete(`v1/campaigns/${id}`)).status, 'delete').toBe(401);

    const row = await campaignRow(id);
    expect.soft(row.status, 'status untouched').toBe('DRAFT');
    expect.soft(row.deleted_at, 'not deleted').toBeNull();
  });

  test('BUG-002: USER cannot update, run or delete a campaign', async ({
    admin,
    userA,
  }) => {
    const campaign = await createCampaign(admin.api);
    const id = campaign.id;

    expect
      .soft((await userA.api.patch(`v1/campaigns/${id}`, { name: 'pwned' })).status, 'update')
      .toBe(403);
    for (const action of ['activate', 'pause', 'end', 'close']) {
      expect
        .soft((await userA.api.post(`v1/campaigns/${id}/${action}`)).status, action)
        .toBe(403);
    }
    expect.soft((await userA.api.delete(`v1/campaigns/${id}`)).status, 'delete').toBe(403);

    const row = await campaignRow(id);
    expect.soft(row.status).toBe('DRAFT');
    expect.soft(row.deleted_at).toBeNull();
  });

  test('BUG-015: lifecycle transitions are validated', async ({ admin }) => {
    // COMPLETED campaign must stay completed. Nothing sets COMPLETED through the
    // API any more, so put the campaign there directly.
    const completed = await activeCampaign(admin.api);
    await dbQuery(
      "UPDATE chung_suc_campaigns SET status = 'COMPLETED' WHERE id = $1",
      [completed.id],
    );
    for (const action of ['activate', 'pause']) {
      const result = await admin.api.post(`v1/campaigns/${completed.id}/${action}`);
      expect.soft(result.status, `COMPLETED -> ${action}`).toBe(400);
    }
    expect.soft((await campaignRow(completed.id)).status).toBe('COMPLETED');

    // CLOSED is terminal.
    const closed = await activeCampaign(admin.api);
    expect([200, 201]).toContain(
      (await admin.api.post(`v1/campaigns/${closed.id}/close`)).status,
    );
    const reopen = await admin.api.post(`v1/campaigns/${closed.id}/activate`);
    expect.soft(reopen.status, 'CLOSED -> activate').toBe(400);
    expect.soft((await campaignRow(closed.id)).status).toBe('CLOSED');

    // A DRAFT campaign cannot be paused.
    const draft = await createCampaign(admin.api);
    const pause = await admin.api.post(`v1/campaigns/${draft.id}/pause`);
    expect.soft(pause.status, 'DRAFT -> pause').toBe(400);
  });
});

test.describe('G. Submitting an invite code', () => {
  test('a logged-in user submits an invite code and the request waits as PENDING', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api, { targetQuantity: 8 });
    const code = inviteCode();
    const result = await join(userA, campaign.id, 3, { inviteCode: code });
    expect(result.status).toBe(201);
    const request = unwrap(result.body);
    expect(request).toMatchObject({
      campaignId: campaign.id,
      accountId: userA.accountId,
      quantity: 3,
      status: 'PENDING',
      unitPrice: '10000.0000',
      inviteCodeMasked: `••••${code.slice(-4)}`,
    });

    // The code never leaves the server in clear, hashed or encrypted form.
    const body = JSON.stringify(result.body);
    expect.soft(body.includes(code), 'response leaks the invite code').toBe(false);
    expect.soft(body.includes('codeHash')).toBe(false);
    expect.soft(body.includes('encryptedCode')).toBe(false);

    const [row] = await dbQuery<{
      code_hash: string;
      encrypted_code: string;
      unit_price: string;
      status: string;
    }>(
      'SELECT code_hash, encrypted_code, unit_price, status FROM chung_suc_participants WHERE id = $1',
      [request.id],
    );
    expect(row.status).toBe('PENDING');
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.encrypted_code.includes(code), 'code stored in clear').toBe(false);

    const price = unwrap(
      (
        await userA.api.post('v1/pricing/calculate', {
          productId: campaign.productId,
          accountId: userA.accountId,
          quantity: 3,
        })
      ).body,
    );
    expect(row.unit_price).toBe(price.finalPrice);

    const progress = unwrap(
      (await userA.api.get(`v1/campaigns/${campaign.id}/progress`)).body,
    );
    expect(progress).toMatchObject({ participantCount: 1, totalQuantity: 3 });
    expect((await campaignRow(campaign.id)).status).toBe('ACTIVE');
  });

  test('BUG-004: submitting requires authentication', async ({
    admin,
    anon,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const result = await anon.post(`v1/campaigns/${campaign.id}/join`, {
      accountId: userA.accountId,
      inviteCode: inviteCode(),
      quantity: 1,
    });
    expect.soft(result.status).toBe(401);
    expect((await campaignRow(campaign.id)).participants).toBe('0');
  });

  test('BUG-004: a user cannot submit on behalf of another account', async ({
    admin,
    userA,
    userB,
  }) => {
    const campaign = await activeCampaign(admin.api);
    // userA's token, userB's accountId.
    const result = await userA.api.post(`v1/campaigns/${campaign.id}/join`, {
      accountId: userB.accountId,
      inviteCode: inviteCode(),
      quantity: 1,
    });

    const rows = await dbQuery<{ account_id: string }>(
      'SELECT account_id FROM chung_suc_participants WHERE campaign_id = $1',
      [campaign.id],
    );
    // Either rejected, or recorded for the authenticated account - never for B.
    expect(rows.map((row) => row.account_id)).not.toContain(userB.accountId);
    if (result.status < 300) {
      expect(unwrap(result.body).accountId).toBe(userA.accountId);
    } else {
      expect([400, 403]).toContain(result.status);
    }
  });

  test('the invite code is required and bounded', async ({ admin, userA }) => {
    const campaign = await activeCampaign(admin.api);
    const attempts: [string, unknown][] = [
      ['empty', ''],
      ['whitespace only', '   '],
      ['longer than 100 chars', 'x'.repeat(101)],
      ['number', 12345],
      ['object', { code: 'abc' }],
      ['null', null],
    ];
    for (const [label, code] of attempts) {
      const result = await join(userA, campaign.id, 1, { inviteCode: code });
      expect.soft(result.status, `inviteCode: ${label}`).toBe(400);
    }
    const missing = await userA.api.post(`v1/campaigns/${campaign.id}/join`, {
      quantity: 1,
    });
    expect.soft(missing.status, 'inviteCode missing').toBe(400);

    // orderId is no longer accepted: the order is created when the wallet is charged.
    const withOrder = await join(userA, campaign.id, 1, { orderId: randomId() });
    expect.soft(withOrder.status, 'orderId').toBe(400);

    expect((await campaignRow(campaign.id)).participants).toBe('0');
  });

  test('BUG-004: quantity must be a positive integer within the per-code maximum', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api, { targetQuantity: 8 });

    for (const quantity of [0, -1, -5, 1.5, '3', 'abc', null, 9, 1_000_000]) {
      const result = await join(userA, campaign.id, quantity);
      expect.soft(result.status, `quantity=${JSON.stringify(quantity)}`).toBe(400);
    }
    const missing = await userA.api.post(`v1/campaigns/${campaign.id}/join`, {
      inviteCode: inviteCode(),
    });
    expect.soft(missing.status, 'quantity missing').toBe(400);
    expect.soft((await campaignRow(campaign.id)).participants).toBe('0');

    // The maximum itself is allowed.
    expect((await join(userA, campaign.id, 8)).status).toBe(201);
  });

  test('a campaign whose product has no price cannot take requests', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api, {}, null);
    const result = await join(userA, campaign.id, 1);
    expect(result.status).toBe(400);
    expect((await campaignRow(campaign.id)).participants).toBe('0');
  });

  test('campaigns that are not running cannot take requests', async ({
    admin,
    userA,
  }) => {
    const draft = await createCampaign(admin.api);
    expect.soft((await join(userA, draft.id)).status, 'DRAFT').toBe(400);

    const upcoming = await createCampaign(admin.api, {
      startTime: isoFromNow(HOUR),
      endTime: isoFromNow(DAY),
    });
    await admin.api.post(`v1/campaigns/${upcoming.id}/activate`);
    expect.soft((await join(userA, upcoming.id)).status, 'UPCOMING').toBe(400);

    for (const action of ['pause', 'end', 'close']) {
      const campaign = await activeCampaign(admin.api);
      await admin.api.post(`v1/campaigns/${campaign.id}/${action}`);
      expect.soft((await join(userA, campaign.id)).status, action).toBe(400);
      expect((await campaignRow(campaign.id)).participants).toBe('0');
    }

    expect((await join(userA, randomId())).status).toBe(404);
  });

  test('the same invite code cannot have two open requests in one campaign', async ({
    admin,
    userA,
    userB,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const code = inviteCode();
    expect((await join(userA, campaign.id, 2, { inviteCode: code })).status).toBe(201);

    // Same account, another account, and surrounding whitespace all hit the same code.
    expect.soft((await join(userA, campaign.id, 1, { inviteCode: code })).status).toBe(409);
    expect.soft((await join(userB, campaign.id, 1, { inviteCode: code })).status).toBe(409);
    expect
      .soft((await join(userB, campaign.id, 1, { inviteCode: `  ${code} ` })).status)
      .toBe(409);
    expect((await campaignRow(campaign.id)).participants).toBe('1');

    // A different code, or the same code in another campaign, is independent.
    expect((await join(userB, campaign.id, 1)).status).toBe(201);
    const other = await activeCampaign(admin.api);
    expect((await join(userA, other.id, 1, { inviteCode: code })).status).toBe(201);
  });

  test('concurrent submissions of one invite code: exactly one is accepted', async ({
    admin,
    anon,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const code = inviteCode();
    const users = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => registerUser(anon, `racer${n}`)),
    );
    const results = await Promise.all(
      users.map((user) => join(user, campaign.id, 1, { inviteCode: code })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect((await campaignRow(campaign.id)).participants).toBe('1');
  });

  test('concurrent submissions of different invite codes are all accepted', async ({
    admin,
    anon,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const users = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => registerUser(anon, `joiner${n}`)),
    );
    const results = await Promise.all(
      users.map((user) => join(user, campaign.id, 2)),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const progress = unwrap(
      (await anon.get(`v1/campaigns/${campaign.id}/progress`)).body,
    );
    expect(progress).toMatchObject({ participantCount: 5, totalQuantity: 10 });
  });
});

test.describe('G. Managing my requests', () => {
  test('a user lists only their own requests', async ({ admin, userA, userB }) => {
    const campaign = await activeCampaign(admin.api);
    const mine = unwrap((await join(userA, campaign.id, 2)).body);
    const theirs = unwrap((await join(userB, campaign.id, 1)).body);

    const listed = await userA.api.get('v1/campaigns/requests/me');
    expect(listed.status).toBe(200);
    const items = unwrap(listed.body) as any[];
    const ids = items.map((item) => item.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
    expect(items.find((item) => item.id === mine.id)).toMatchObject({
      status: 'PENDING',
      quantity: 2,
      campaign: { id: campaign.id },
    });
  });

  test('listing and cancelling require authentication', async ({
    admin,
    anon,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const request = unwrap((await join(userA, campaign.id)).body);

    expect.soft((await anon.get('v1/campaigns/requests/me')).status).toBe(401);
    expect
      .soft((await anon.post(`v1/campaigns/requests/${request.id}/cancel`)).status)
      .toBe(401);
    expect((await requestStatus(request.id))).toBe('PENDING');
  });

  test('cancelling frees the invite code and drops the request from progress', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const code = inviteCode();
    const request = unwrap(
      (await join(userA, campaign.id, 3, { inviteCode: code })).body,
    );

    const cancelled = await userA.api.post(
      `v1/campaigns/requests/${request.id}/cancel`,
    );
    expect([200, 201]).toContain(cancelled.status);
    expect(unwrap(cancelled.body)).toMatchObject({
      id: request.id,
      status: 'CANCELLED',
    });
    expect(unwrap(cancelled.body).cancelledAt).not.toBeNull();

    const progress = unwrap(
      (await userA.api.get(`v1/campaigns/${campaign.id}/progress`)).body,
    );
    expect(progress).toMatchObject({ participantCount: 0, totalQuantity: 0 });

    // Cancelling twice is refused; the code can be submitted again.
    const again = await userA.api.post(
      `v1/campaigns/requests/${request.id}/cancel`,
    );
    expect(again.status).toBe(409);
    expect((await join(userA, campaign.id, 1, { inviteCode: code })).status).toBe(201);
  });

  test('a user cannot cancel a request owned by someone else', async ({
    admin,
    userA,
    userB,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const request = unwrap((await join(userA, campaign.id)).body);

    const result = await userB.api.post(
      `v1/campaigns/requests/${request.id}/cancel`,
    );
    expect(result.status).toBe(404);
    expect(await requestStatus(request.id)).toBe('PENDING');

    expect(
      (await userA.api.post(`v1/campaigns/requests/${randomId()}/cancel`)).status,
    ).toBe(404);
  });

  test('a request that is already being processed cannot be cancelled', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const request = unwrap((await join(userA, campaign.id)).body);
    await dbQuery(
      "UPDATE chung_suc_participants SET status = 'PROCESSING' WHERE id = $1",
      [request.id],
    );

    const result = await userA.api.post(
      `v1/campaigns/requests/${request.id}/cancel`,
    );
    expect(result.status).toBe(409);
    expect(await requestStatus(request.id)).toBe('PROCESSING');
  });
});

test.describe('G. Participant data', () => {
  test('BUG-001: the participant list never exposes account credentials and is not public', async ({
    admin,
    anon,
    userA,
    userB,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const code = inviteCode();
    expect((await join(userA, campaign.id, 1, { inviteCode: code })).status).toBe(201);
    const path = `v1/campaigns/${campaign.id}/participants`;

    const asAdmin = await admin.api.get(path);
    expect(asAdmin.status).toBe(200);
    expect(unwrap(asAdmin.body)[0]).toMatchObject({
      status: 'PENDING',
      inviteCodeMasked: `••••${code.slice(-4)}`,
    });
    expect
      .soft(JSON.stringify(asAdmin.body).includes(code), 'admin response leaks the invite code')
      .toBe(false);
    expect
      .soft(JSON.stringify(asAdmin.body).includes('"passwordHash"'), 'admin response leaks passwordHash')
      .toBe(false);

    const asAnon = await anon.get(path);
    expect.soft(asAnon.status, 'anonymous').toBe(401);
    const anonBody = JSON.stringify(asAnon.body ?? null);
    expect.soft(anonBody.includes('"passwordHash"'), 'anonymous response leaks passwordHash').toBe(false);
    expect.soft(anonBody.includes(userA.email), 'anonymous response leaks participant email').toBe(false);

    // Another customer must not see who joined (email / account details).
    const asOther = await userB.api.get(path);
    const otherBody = JSON.stringify(asOther.body ?? null);
    expect.soft(otherBody.includes('"passwordHash"'), 'other user response leaks passwordHash').toBe(false);
    expect.soft(otherBody.includes(userA.email), 'other user response leaks participant email').toBe(false);
  });
});

test.describe('G. Admin processing requests (US-CS-ADM-04)', () => {
  async function setStatus(
    client: ApiClient,
    requestId: string,
    status: string,
    note?: string,
  ) {
    return client.patch(`v1/campaigns/requests/${requestId}/status`, {
      status,
      ...(note ? { note } : {}),
    });
  }

  test('admin moves a request through the processing flow and history is kept', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const request = unwrap((await join(userA, campaign.id, 2)).body);

    for (const status of ['CHECKING', 'PROCESSING', 'PARTIAL_SUCCESS']) {
      const result = await setStatus(admin.api, request.id, status, `to ${status}`);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(unwrap(result.body).status).toBe(status);
    }
    expect(await requestStatus(request.id)).toBe('PARTIAL_SUCCESS');

    const listed = unwrap<any[]>(
      (await admin.api.get(`v1/campaigns/${campaign.id}/participants`)).body,
    );
    const history = listed.find((item) => item.id === request.id).statusHistory;
    expect(history.map((entry: any) => [entry.from, entry.to])).toEqual([
      ['PENDING', 'CHECKING'],
      ['CHECKING', 'PROCESSING'],
      ['PROCESSING', 'PARTIAL_SUCCESS'],
    ]);
    expect(history[0]).toMatchObject({ by: admin.accountId, note: 'to CHECKING' });

    // Khách thấy trạng thái mới nhưng mã mời vẫn được che.
    const mine = unwrap<any[]>((await userA.api.get('v1/campaigns/requests/me')).body);
    expect(mine.find((item) => item.id === request.id)).toMatchObject({
      status: 'PARTIAL_SUCCESS',
      inviteCodeMasked: expect.stringMatching(/^••••/),
    });
  });

  test('transitions outside the flow are rejected with 409', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const code = inviteCode();
    const request = unwrap(
      (await join(userA, campaign.id, 1, { inviteCode: code })).body,
    );

    // PENDING không nhảy thẳng sang SUCCESS; CANCELLED là thao tác của khách.
    for (const status of ['SUCCESS', 'CANCELLED', 'PENDING']) {
      const result = await setStatus(admin.api, request.id, status);
      expect(result.status, status).toBe(409);
      expect(result.body.errorCode).toBe('REQUEST_STATUS_TRANSITION_NOT_ALLOWED');
    }

    expect((await setStatus(admin.api, request.id, 'FAILED')).status).toBe(200);
    // FAILED là trạng thái cuối.
    expect((await setStatus(admin.api, request.id, 'PROCESSING')).status).toBe(409);
    // Yêu cầu đã đóng thì mã được gửi lại.
    expect(
      (await join(userA, campaign.id, 1, { inviteCode: code })).status,
    ).toBe(201);
  });

  test('a cancelled request cannot be processed', async ({ admin, userA }) => {
    const campaign = await activeCampaign(admin.api);
    const request = unwrap((await join(userA, campaign.id)).body);
    await userA.api.post(`v1/campaigns/requests/${request.id}/cancel`);
    expect((await setStatus(admin.api, request.id, 'PROCESSING')).status).toBe(409);
  });

  test('only ADMIN can change a request status; input is validated', async ({
    admin,
    anon,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api);
    const request = unwrap((await join(userA, campaign.id)).body);

    expect((await setStatus(anon, request.id, 'PROCESSING')).status).toBe(401);
    expect((await setStatus(userA.api, request.id, 'PROCESSING')).status).toBe(403);
    expect((await setStatus(admin.api, request.id, 'DONE')).status).toBe(400);
    expect(
      (await setStatus(admin.api, '00000000-0000-0000-0000-000000000000', 'PROCESSING'))
        .status,
    ).toBe(404);
    expect(await requestStatus(request.id)).toBe('PENDING');
  });
});
