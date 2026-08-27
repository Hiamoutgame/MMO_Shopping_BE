import { BadRequestException } from '@nestjs/common';

export const DEFAULT_REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const DEFAULT_REPORT_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReportPeriod {
  from: Date;
  to: Date;
  timezone: string;
}

/**
 * Chuẩn hóa khoảng thời gian báo cáo từ query params.
 * - Thiếu cả `from` lẫn `to`: lấy 30 ngày gần nhất.
 * - Chỉ có `from`: `to = now`.
 * - Chỉ có `to`: `from = to - 30 ngày`.
 * - Từ chối `to <= from`.
 * Pure — `now` được inject để test được, mặc định là thời điểm hiện tại.
 */
export function resolveReportPeriod(
  from?: string,
  to?: string,
  timezone?: string,
  now = new Date(),
): ReportPeriod {
  const tz = timezone?.trim() ? timezone : DEFAULT_REPORT_TIMEZONE;
  const toDate = to ? parseDate(to) : now;
  const fromDate = from
    ? parseDate(from)
    : new Date(toDate.getTime() - DEFAULT_REPORT_DAYS * MS_PER_DAY);

  if (toDate.getTime() <= fromDate.getTime()) {
    throw new BadRequestException({
      success: false,
      data: null,
      message: 'to phải lớn hơn from.',
      errorCode: 'INVALID_REPORT_PERIOD',
    });
  }

  return { from: fromDate, to: toDate, timezone: tz };
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({
      success: false,
      data: null,
      message: 'Datetime không hợp lệ, cần ISO 8601.',
      errorCode: 'VALIDATION_ERROR',
    });
  }
  return date;
}
