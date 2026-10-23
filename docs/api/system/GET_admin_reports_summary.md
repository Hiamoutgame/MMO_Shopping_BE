# Admin summary report

## Endpoint

- Method: `GET`
- URL: `/api/v1/admin/reports/summary`
- Module: `system`
- Auth: `Admin`
- User stories: `US-ADM-10`

## Mô tả

Báo cáo doanh thu, order, user, tồn kho, view và support-code theo khoảng thời gian.

## Request

### Path params

- Không có.

### Query params

- `from`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.
- `to`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.
- `timezone?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.

### Body

- Không có.

### Headers

- `Authorization: Bearer <accessToken>` khi Auth là `User`, `Admin` hoặc `User/Admin`.
- `Idempotency-Key` khi mục idempotency bên dưới yêu cầu.
- Callback dùng `X-Signature`, `X-Timestamp` và `Idempotency-Key`, không dùng JWT.

## Validation

- UUID phải là string UUID hợp lệ.
- Datetime dùng ISO 8601.
- Money dùng decimal string, không âm; transaction amount phải lớn hơn 0.
- Enum phải dùng giá trị viết hoa đã định nghĩa trong `docs/database/entities.md`.
- Pagination dùng `page`, `pageSize`; response list dùng `items`, `total`, `page`, `pageSize`, `totalPages`.

## Response

### Success `200`

```json
{
  "success": true,
  "data": {
    "summaryReport": {
      "period": {
        "from": "2026-07-28T12:00:00.000Z",
        "to": "2026-08-27T12:00:00.000Z",
        "timezone": "Asia/Ho_Chi_Minh"
      },
      "revenue": {
        "gross": "350.0000",
        "refunded": "90.0000",
        "net": "260.0000",
        "currency": "VND"
      },
      "orders": {
        "total": 4,
        "paid": 3,
        "byStatus": {
          "PENDING": 1,
          "PROCESSING": 0,
          "COMPLETED": 1,
          "CANCELLED": 0,
          "PARTIALLY_REFUNDED": 1,
          "REFUNDED": 1
        }
      },
      "users": { "total": 2, "new": 1 },
      "inventory": {
        "total": 5,
        "byStatus": { "AVAILABLE": 3, "RESERVED": 0, "SOLD": 2, "VOID": 0 }
      },
      "productViews": { "total": 10, "authenticated": 6, "anonymous": 4 },
      "supportCodeRequests": {
        "total": 0,
        "byStatus": {
          "ACTIVE": 0,
          "PROCESSING": 0,
          "SUCCESS": 0,
          "PARTIAL_SUCCESS": 0,
          "FAILED": 0,
          "CANCELLED": 0
        }
      }
    }
  },
  "message": "OK",
  "errorCode": null
}
```

**Quy ước tính toán:**

- `revenue.gross`: tổng `Order.totalAmount` của đơn có `paymentStatus` là `PAID` hoặc `REFUNDED`.
- `revenue.refunded`: tổng `Order.refundedAmount`; `net = gross - refunded`.
- Order dùng `placedAt`; user dùng `createdAt`; view dùng `viewedAt`; support-code dùng `submittedAt`.
- `users.total` và inventory là snapshot hiện tại; các metric còn lại nằm trong khoảng `[from, to)`.
- Breakdown luôn trả đủ mọi enum với giá trị `0` nếu chưa có dữ liệu.
- Tiền luôn là decimal string, không chuyển sang JavaScript number.

**Query params:**

- `from?`: ISO 8601 bắt đầu khoảng (inclusive).
- `to?`: ISO 8601 kết thúc khoảng (exclusive).
- `timezone?`: IANA timezone, mặc định `Asia/Ho_Chi_Minh`.
- Nếu thiếu cả hai mốc, lấy 30 ngày gần nhất; chỉ có `from` thì `to = now`; chỉ có `to` thì `from = to - 30 ngày`; từ chối `to <= from` với `400 INVALID_REPORT_PERIOD`.

### Error example

```json
{
  "success": false,
  "data": null,
  "message": "Dữ liệu không hợp lệ.",
  "errorCode": "VALIDATION_ERROR"
}
```

### Error codes

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `IDEMPOTENCY_REPLAYED`
- `CONCURRENT_MODIFICATION`

## Ràng buộc nghiệp vụ

- Dashboard/report ưu tiên read query từ transaction data, không tạo public API cho outbox worker.
- Audit log chỉ admin được đọc; dữ liệu nhạy cảm trong diff phải redacted.
- Response phải dùng envelope chuẩn và chỉ trả dữ liệu thuộc quyền truy cập của caller.

## Idempotency

GET endpoint là read-only và có thể retry an toàn.

## Transaction & concurrency

- Read endpoint không mở transaction dài.
- Write endpoint phải dùng transaction khi thay đổi nhiều bảng hoặc đụng wallet, inventory, voucher, order, session, dispatch, warranty.
- Concurrent update phải trả `409 CONCURRENT_MODIFICATION` hoặc error chuyên biệt hơn nếu phát hiện xung đột nghiệp vụ.

## Dữ liệu nhạy cảm

- Không trả `passwordHash`, refresh-token hash, `encryptedPayload`, tool credentials hoặc payload giao hàng của user khác.
- Secret/config nhạy cảm phải redacted trong response và audit diff.

## Audit

Có. Ghi `AdminAuditLog` cho thao tác tạo/cập nhật/xóa hoặc thay đổi tiền/order/inventory/integration/warranty.

## Liên kết

- Conventions: [../conventions.md](../conventions.md)
- Source: [../../database/userStory.md](../../database/userStory.md), [../../database/entities.md](../../database/entities.md)
