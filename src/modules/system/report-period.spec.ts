import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_REPORT_DAYS,
  DEFAULT_REPORT_TIMEZONE,
  resolveReportPeriod,
} from './report-period';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('resolveReportPeriod', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');

  it('mặc định 30 ngày gần nhất khi thiếu cả from lẫn to', () => {
    const period = resolveReportPeriod(undefined, undefined, undefined, now);
    expect(period.to.toISOString()).toBe(now.toISOString());
    expect(period.from.getTime()).toBe(
      now.getTime() - DEFAULT_REPORT_DAYS * MS_PER_DAY,
    );
    expect(period.timezone).toBe(DEFAULT_REPORT_TIMEZONE);
  });

  it('chỉ có from thì to = now', () => {
    const from = new Date(now.getTime() - 2 * MS_PER_DAY);
    const period = resolveReportPeriod(
      from.toISOString(),
      undefined,
      undefined,
      now,
    );
    expect(period.from.toISOString()).toBe(from.toISOString());
    expect(period.to.toISOString()).toBe(now.toISOString());
  });

  it('chỉ có to thì from = to - 30 ngày', () => {
    const to = new Date('2026-09-10T00:00:00.000Z');
    const period = resolveReportPeriod(
      undefined,
      to.toISOString(),
      undefined,
      now,
    );
    expect(period.to.toISOString()).toBe(to.toISOString());
    expect(period.from.getTime()).toBe(
      to.getTime() - DEFAULT_REPORT_DAYS * MS_PER_DAY,
    );
  });

  it('tôn trọng timezone tùy chỉnh', () => {
    const period = resolveReportPeriod(undefined, undefined, 'UTC', now);
    expect(period.timezone).toBe('UTC');
  });

  it('từ chối to <= from', () => {
    const from = new Date(now.getTime() - MS_PER_DAY);
    const to = new Date(from.getTime());
    expect(() =>
      resolveReportPeriod(from.toISOString(), to.toISOString(), undefined, now),
    ).toThrow(BadRequestException);
  });

  it('từ chối datetime không hợp lệ', () => {
    expect(() =>
      resolveReportPeriod('not-a-date', undefined, undefined, now),
    ).toThrow(BadRequestException);
  });
});
