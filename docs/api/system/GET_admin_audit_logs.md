# Admin audit log list

## Endpoint

- Method: `GET`
- URL: `/api/v1/admin/audit-logs`
- Module: `system`
- Auth: `Admin`
- User stories: `US-ADM-03, US-ADM-04, US-ADM-05, US-ADM-07, US-ADM-09`

## Mô tả

Liệt kê audit log thay đổi admin.

## Request

### Path params

- Không có.

### Query params

- `page`: theo kiểu dữ liệu phù hợp; `page >= 1`, `pageSize` trong giới hạn hệ thống.
- `pageSize`: theo kiểu dữ liệu phù hợp; `page >= 1`, `pageSize` trong giới hạn hệ thống.
- `actorId?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.
- `action?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.
- `entityType?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.
- `from?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.
- `to?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.

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
    "items": [
      {
        "id": "8f8f7a6e-62c7-4c2f-95bc-33d8312e7a7a",
        "actor": {
          "id": "2b3c4d5e-0000-0000-0000-000000000000",
          "email": "admin@example.com",
          "name": "Admin"
        },
        "action": "ORDER_REFUND",
        "entityType": "Order",
        "entityId": "11111111-1111-1111-1111-111111111111",
        "metadata": { "amount": "40.0000", "fullyRefunded": false },
        "ipAddress": "127.0.0.1",
        "createdAt": "2026-08-27T10:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  },
  "message": "OK",
  "errorCode": null
}
```

**Ghi chú:**

- Sắp xếp `createdAt DESC, id DESC`.
- `actor` là account admin đã sanitize; nếu account đã bị soft-delete thì trả `null`.
- `metadata` được chạy `redactSecrets` lần nữa khi đọc để phòng dữ liệu cũ chưa được che.
- Filter: `actorId?` (UUID), `action?`, `entityType?`, `from?`/`to?` (ISO 8601).

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
- Endpoint list phải phân trang theo envelope chuẩn và không trả dữ liệu ngoài quyền truy cập.

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
