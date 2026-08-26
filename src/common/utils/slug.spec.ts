import { slugify } from './slug';

describe('slugify', () => {
  it('converts Vietnamese diacritics to ascii kebab-case', () => {
    expect(slugify('Áo Thun Đẹp')).toBe('ao-thun-dep');
    expect(slugify('Điện thoại iPhone 15')).toBe('dien-thoai-iphone-15');
  });

  it('collapses whitespace and strips trailing dashes', () => {
    expect(slugify('  Nhiều    khoảng  trắng ')).toBe('nhieu-khoang-trang');
    expect(slugify('---đầu cuối---')).toBe('dau-cuoi');
  });

  it('keeps only alphanumerics and dashes', () => {
    expect(slugify('Giá: 100.000đ!')).toBe('gia-100-000d');
  });
});
