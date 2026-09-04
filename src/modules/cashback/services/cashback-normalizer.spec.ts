import { compactQuery, normalizeProviderData } from './cashback-normalizer';

describe('cashback normalizer', () => {
  it('normalizes snake case, identifiers, money and pagination', () => {
    expect(
      normalizeProviderData({
        items: [{ id: 12, cashback_amount: 1500, amount_after: 2500 }],
        pagination: { total: 21, current_page: 2, per_page: 10, last_page: 3 },
      }),
    ).toEqual({
      items: [{ id: '12', cashbackAmount: '1500', amountAfter: '2500' }],
      total: 21,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });
  });

  it('omits empty query values and maps perPage', () => {
    expect(
      compactQuery({ page: 1, perPage: 20, search: '', status: undefined }),
    ).toEqual({
      page: 1,
      per_page: 20,
    });
  });
});
