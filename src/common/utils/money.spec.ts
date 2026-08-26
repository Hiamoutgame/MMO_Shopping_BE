import { addMoney, formatMoney, multiplyMoney, subtractMoney } from './money';

describe('money helpers', () => {
  it('uses decimal arithmetic for money operations', () => {
    expect(addMoney('0.1', '0.2')).toBe('0.3000');
    expect(subtractMoney('1.0000', '0.3333')).toBe('0.6667');
    expect(multiplyMoney('19.9900', 3)).toBe('59.9700');
    expect(formatMoney('10')).toBe('10.0000');
  });
});
