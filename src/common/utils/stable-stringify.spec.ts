import { stableStringify } from './stable-stringify';

describe('stableStringify', () => {
  it('không phụ thuộc thứ tự key của object', () => {
    const a = { x: 1, y: { b: 2, a: [1, 2] } };
    const b = { y: { a: [1, 2], b: 2 }, x: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('phân biệt nội dung khác nhau', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});
