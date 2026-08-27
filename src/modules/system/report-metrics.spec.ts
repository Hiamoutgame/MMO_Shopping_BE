import { computeNetRevenue, zeroFill } from './report-metrics';

describe('report metrics', () => {
  it('tính net = gross - refunded bằng decimal string', () => {
    expect(computeNetRevenue('100.0000', '40.0000')).toBe('60.0000');
    expect(computeNetRevenue('100.0000', '0.0000')).toBe('100.0000');
    expect(computeNetRevenue('0.0000', '0.0000')).toBe('0.0000');
  });

  it('zeroFill trả đủ mọi status với 0 nếu thiếu dữ liệu', () => {
    const result = zeroFill(
      ['PENDING', 'COMPLETED', 'CANCELLED'],
      new Map([['COMPLETED', 3]]),
    );
    expect(result).toEqual({ PENDING: 0, COMPLETED: 3, CANCELLED: 0 });
  });

  it('zeroFill giữ đúng thứ tự enum', () => {
    const result = zeroFill(
      ['A', 'B'],
      new Map([
        ['B', 5],
        ['A', 2],
      ]),
    );
    expect(Object.keys(result)).toEqual(['A', 'B']);
    expect(result.A).toBe(2);
    expect(result.B).toBe(5);
  });
});
