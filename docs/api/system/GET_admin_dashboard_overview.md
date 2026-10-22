# Admin dashboard overview

## Endpoint

- Method: `GET`
- URL: `/api/v1/admin/dashboard/overview`
- Module: `system`
- Auth: `Admin`
- User stories: `US-ADM-11`

## Mô tả

Trả số liệu tổng quan hệ thống từ read queries.

## Request

### Path params

- Không có.

### Query params

- Không có.

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
    "overview": {
      "last24Hours": {
        "revenue": { "gross": "100.0000", "refunded": "0.0000", "net": "100.0000", "currency": "VND" },
        "orders": { "total": 1, "paid": 1, "byStatus": { "PENDING": 0, "PROCESSING": 0, "COMPLETED": 1, "CANCELLED": 0, "PARTIALLY_REFUNDED": 0, "REFUNDED": 0 } },
        "users": { "new": 1 },
        "productViews": { "total": 5, "authenticated": 3, "anonymous": 2 },
        "supportCodeRequests": { "total": 0, "byStatus": { "ACTIVE": 0, "PROCESSING": 0, "SUCCESS": 0, "PARTIAL_SUCCESS": 0, "FAILED": 0, "CANCELLED": 0 } }
      },
      "last30Days": {
        "revenue": { "gross": "350.0000", "refunded": "90.0000", "net": "260.0000", "currency": "VND" },
        "orders": { "total": 4, "paid": 3, "byStatus": { "PENDING": 1, "PROCESSING": 0, "COMPLETED": 1, "CANCELLED": 0, "PARTIALLY_REFUNDED": 1, "REFUNDED": 1 } },
        "users": { "new": 2 },
        "productViews": { "total": 10, "authenticated": 6, "anonymous": 4 },
        "supportCodeRequests": { "total": 0, "byStatus": { "ACTIVE": 0, "PROCESSING": 0, "SUCCESS": 0, "PARTIAL_SUCCESS": 0, "FAILED": 0, "CANCELLED": 0 } }
      },
      "current": {
        "users": { "total": 2 },
        "orders": { "pending": 1, "processing": 0 },
        "inventory": { "total": 5, "byStatus": { "AVAILABLE": 3, "RESERVED": 0, "SOLD": 2, "VOID": 0 } },
        "supportCodeRequests": { "total": 0, "byStatus": { "ACTIVE": 0, "PROCESSING": 0, "SUCCESS": 0, "PARTIAL_SUCCESS": 0, "FAILED": 0, "CANCELLED": 0 } }
      }
    }
  },
  "message": "OK",
  "errorCode": null
}
```

**Quy ước:** `last24Hours` và `last30Days` dùng cùng công thức với báo cáo tổng hợp (để tránh hai nguồn số liệu khác nhau). `current` là snapshot hiện tại của user, order đang xử lý, inventory và support-code.

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
