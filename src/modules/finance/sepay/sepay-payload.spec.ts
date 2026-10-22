import {
  extractPaymentCode,
  parseSepayListItem,
  parseSepayWebhook,
} from './sepay-payload';

// Payload mẫu theo tài liệu webhook SePay.
const webhook = {
  id: 92704,
  gateway: 'Vietcombank',
  transactionDate: '2023-03-25 14:02:37',
  accountNumber: '0123499999',
  code: null,
  content: 'chuyen tien mua iphone MMOAB23CD45',
  transferType: 'in',
  transferAmount: 2277000,
  accumulated: 19077000,
  subAccount: null,
  referenceCode: 'MBVCB.3278907687',
  description: '',
};

describe('parseSepayWebhook', () => {
  it('normalizes the documented payload', () => {
    expect(parseSepayWebhook(webhook)).toMatchObject({
      sepayId: '92704',
      gateway: 'Vietcombank',
      accountNumber: '0123499999',
      code: null,
      transferType: 'in',
      transferAmount: 2277000,
      referenceCode: 'MBVCB.3278907687',
    });
  });

  it('rejects payloads without id, amount or direction', () => {
    expect(parseSepayWebhook(null)).toBeNull();
    expect(parseSepayWebhook([])).toBeNull();
    expect(parseSepayWebhook({ ...webhook, id: undefined })).toBeNull();
    expect(parseSepayWebhook({ ...webhook, id: -1 })).toBeNull();
    expect(parseSepayWebhook({ ...webhook, transferAmount: 'x' })).toBeNull();
    expect(parseSepayWebhook({ ...webhook, transferType: 'IN' })).toBeNull();
  });
});

describe('parseSepayListItem', () => {
  it('maps the transactions API shape', () => {
    expect(
      parseSepayListItem({
        id: '93',
        bank_brand_name: 'MBBank',
        account_number: '0359123456',
        transaction_date: '2023-02-20 16:35:00',
        amount_out: '0.00',
        amount_in: '150000.00',
        accumulated: '500000.00',
        transaction_content: 'MMOAB23CD45 nap vi',
        reference_number: 'FT23051100000',
        code: null,
      }),
    ).toMatchObject({
      sepayId: '93',
      gateway: 'MBBank',
      transferType: 'in',
      transferAmount: 150000,
      content: 'MMOAB23CD45 nap vi',
    });
  });

  it('treats amount_out as an outgoing transfer', () => {
    expect(
      parseSepayListItem({ id: 5, amount_in: '0', amount_out: '20000' }),
    ).toMatchObject({ transferType: 'out', transferAmount: 20000 });
  });
});

describe('extractPaymentCode', () => {
  it('prefers the code SePay detected', () => {
    expect(extractPaymentCode('MMO', 'MMOAB23CD45', 'khac')).toBe(
      'MMOAB23CD45',
    );
  });

  it('finds the code in content, ignoring case and spaces', () => {
    expect(extractPaymentCode('MMO', null, 'nap tien mmoab23cd45')).toBe(
      'MMOAB23CD45',
    );
    expect(extractPaymentCode('MMO', null, 'ND MMO AB23 CD45 nap')).toBe(
      'MMOAB23CD45',
    );
  });

  it('returns null without a code', () => {
    expect(extractPaymentCode('MMO', null, 'chuyen tien')).toBeNull();
    expect(extractPaymentCode('MMO', null, null)).toBeNull();
  });
});
