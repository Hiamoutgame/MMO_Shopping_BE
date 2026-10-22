import { test, expect } from '../fixtures/auth.fixture';
import { unwrap, type ApiClient, type ApiResult } from '../helpers/api-client';
import { loginAdmin, type Session } from '../helpers/auth';
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
 * G2. Luật sự kiện cấu hình động (variant, eventCode, giới hạn lượt).
 */
const campaignIds: string[] = [];

async function createCampaign(
  admin: ApiClient,
  overrides: Record<string, unknown> = {},
) {
  const product = await createProduct(admin);
  await setProductPricing(product.id, '10000');
  const result = await admin.post('v1/campaigns', {
    productId: product.id,
    name: uniq('rules'),
    slug: uniq('rules').replace(/_/g, '-'),
    targetQuantity: 10,
    startTime: isoFromNow(-HOUR),
    endTime: isoFromNow(DAY),
    ...overrides,
  });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  const campaign = unwrap(result.body);
  campaignIds.push(campaign.id);
  return campaign;
}

async function activeCampaign(
  admin: ApiClient,
  overrides: Record<string, unknown> = {},
) {
  const campaign = await createCampaign(admin, overrides);
  const activated = await admin.post(`v1/campaigns/${campaign.id}/activate`);
  expect(unwrap(activated.body).status).toBe('ACTIVE');
  return campaign;
}

function join(
  session: Session,
  campaignId: string,
  inviteCode: string,
  quantity: number,
) {
  return session.api.post(`v1/campaigns/${campaignId}/join`, {
    inviteCode,
    quantity,
  });
}

// Đóng yêu cầu như khi shop đã xử lý xong, để mã được gửi tiếp.
async function markRequest(id: string, status: string, joinedAt?: Date) {
  await dbQuery(
    `UPDATE chung_suc_participants
     SET status = $2, joined_at = coalesce($3, joined_at)
     WHERE id = $1`,
    [id, status, joinedAt ?? null],
  );
}

// Filter toàn cục (main.ts) hiện chỉ trả message, không trả errorCode,
// nên kiểm tra status + nội dung message.
function expectError(result: ApiResult, status: number, messagePart: string) {
  expect(result.status, JSON.stringify(result.body)).toBe(status);
  expect(String(result.body.message)).toContain(messagePart);
}

function eventCode() {
  return `E2E_${randomId()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()}`;
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

test.describe('G2. Event rule configuration', () => {
  test('variant presets are public', async ({ anon }) => {
    const result = await anon.get('v1/campaigns/variants');
    expect(result.status).toBe(200);
    const presets = unwrap<Array<{ variant: string }>>(result.body);
    expect(presets.map((p) => p.variant).sort()).toEqual(
      ['BAN_BI', 'CUSTOM', 'DOT_PHAO', 'TINH_HOA', 'XAP_XINH'].sort(),
    );
  });

  test('creating with a variant applies its preset; sent fields override it', async ({
    admin,
  }) => {
    const code = eventCode();
    const campaign = await createCampaign(admin.api, {
      variant: 'DOT_PHAO',
      eventCode: code,
      ownerLimitPerDay: 5,
    });
    expect(campaign).toMatchObject({
      eventCode: code,
      variant: 'DOT_PHAO',
      helperLimitPerDay: 2,
      helperLimitTotal: null,
      ownerLimitPerDay: 5,
      dailyReset: true,
    });

    const plain = await createCampaign(admin.api);
    expect(plain).toMatchObject({
      variant: 'CUSTOM',
      eventCode: null,
      ownerLimitTotal: null,
      dailyReset: false,
    });
  });

  test('admin can update rules and clear a limit with null', async ({
    admin,
  }) => {
    const campaign = await createCampaign(admin.api, { variant: 'BAN_BI' });
    const updated = await admin.api.patch(`v1/campaigns/${campaign.id}`, {
      ownerLimitTotal: null,
      pointsCap: 500,
    });
    expect(updated.status).toBe(200);
    expect(unwrap(updated.body)).toMatchObject({
      variant: 'BAN_BI',
      ownerLimitTotal: null,
      pointsCap: 500,
      helperLimitPerDay: 3,
    });
  });

  test('inconsistent rules are rejected', async ({ admin }) => {
    const product = await createProduct(admin.api);
    const base = {
      productId: product.id,
      name: uniq('rules'),
      slug: uniq('rules').replace(/_/g, '-'),
      targetQuantity: 10,
      startTime: isoFromNow(-HOUR),
      endTime: isoFromNow(DAY),
    };

    expectError(
      await admin.api.post('v1/campaigns', {
        ...base,
        ownerLimitPerDay: 3,
        dailyReset: false,
      }),
      400,
      'bật reset hằng ngày',
    );
    expectError(
      await admin.api.post('v1/campaigns', {
        ...base,
        dailyReset: true,
        ownerLimitPerDay: 5,
        ownerLimitTotal: 2,
      }),
      400,
      'mã mời không được lớn hơn',
    );
    for (const bad of [{ helperLimitTotal: 0 }, { eventCode: 'lower_case' }]) {
      const result = await admin.api.post('v1/campaigns', { ...base, ...bad });
      expect(result.status).toBe(400);
    }
  });

  test('event codes are unique', async ({ admin }) => {
    const code = eventCode();
    await createCampaign(admin.api, { eventCode: code });
    const product = await createProduct(admin.api);
    expectError(
      await admin.api.post('v1/campaigns', {
        productId: product.id,
        name: uniq('rules'),
        slug: uniq('rules').replace(/_/g, '-'),
        targetQuantity: 10,
        startTime: isoFromNow(-HOUR),
        endTime: isoFromNow(DAY),
        eventCode: code,
      }),
      409,
      'đã được dùng',
    );
  });
});

test.describe('G2. Invite code limits', () => {
  test('ownerLimitTotal caps an invite code across the event', async ({
    admin,
    userA,
    userB,
  }) => {
    const campaign = await activeCampaign(admin.api, { variant: 'BAN_BI' });
    const code = `Ab1${randomId()}`;

    const first = await join(userA, campaign.id, code, 3);
    expect(first.status).toBe(201);
    await markRequest(unwrap(first.body).id, 'SUCCESS');

    // Mã giữ nguyên hoa/thường: cùng chữ nhưng khác hoa/thường là mã khác.
    const otherCase = await join(userB, campaign.id, code.toLowerCase(), 4);
    expect(otherCase.status).toBe(201);

    const over = await join(userB, campaign.id, code, 2);
    expectError(over, 400, 'chỉ còn nhận được 1 lượt trong sự kiện');

    const last = await join(userB, campaign.id, code, 1);
    expect(last.status).toBe(201);
  });

  test('cancelled and failed requests do not use up the limit', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api, { variant: 'BAN_BI' });
    const code = `Cd2${randomId()}`;

    const cancelled = await join(userA, campaign.id, code, 4);
    expect(cancelled.status).toBe(201);
    await markRequest(unwrap(cancelled.body).id, 'CANCELLED');

    const failed = await join(userA, campaign.id, code, 4);
    expect(failed.status).toBe(201);
    await markRequest(unwrap(failed.body).id, 'FAILED');

    expect((await join(userA, campaign.id, code, 4)).status).toBe(201);
  });

  test('ownerLimitPerDay resets at 00:00 Vietnam time', async ({
    admin,
    userA,
  }) => {
    const campaign = await activeCampaign(admin.api, {
      variant: 'TINH_HOA',
      startTime: isoFromNow(-3 * DAY),
    });
    const code = `Ef3${randomId()}`;

    const today = await join(userA, campaign.id, code, 3);
    expect(today.status).toBe(201);
    await markRequest(unwrap(today.body).id, 'SUCCESS');
    expectError(await join(userA, campaign.id, code, 1), 400, 'lượt');

    // Dời yêu cầu sang hôm qua: lượt hôm nay được tính lại từ 0.
    await markRequest(
      unwrap(today.body).id,
      'SUCCESS',
      new Date(Date.now() - DAY),
    );
    expect((await join(userA, campaign.id, code, 3)).status).toBe(201);
  });
});

test.describe('G2. One-click toggle', () => {
  test('toggle switches a campaign between running and paused', async ({
    admin,
  }) => {
    const campaign = await createCampaign(admin.api);
    const toggle = async () =>
      unwrap((await admin.api.post(`v1/campaigns/${campaign.id}/toggle`)).body)
        .status;

    expect(await toggle()).toBe('ACTIVE');
    expect(await toggle()).toBe('PAUSED');
    expect(await toggle()).toBe('ACTIVE');
  });

  test('only ADMIN can toggle', async ({ admin, anon, userA }) => {
    const campaign = await createCampaign(admin.api);
    expect((await anon.post(`v1/campaigns/${campaign.id}/toggle`)).status).toBe(
      401,
    );
    expect(
      (await userA.api.post(`v1/campaigns/${campaign.id}/toggle`)).status,
    ).toBe(403);
  });
});
