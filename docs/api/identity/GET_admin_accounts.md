# Admin liệt kê account

## Endpoint

- Method: `GET`
- URL: `/api/v1/admin/accounts`
- Module: `identity`
- Auth: `Admin`
- User stories: `US-ADM-03`

## Mô tả

Tìm kiếm, lọc và phân trang account.

## Request

### Path params

- Không có.

### Query params

- `page`: theo kiểu dữ liệu phù hợp; `page >= 1`, `pageSize` trong giới hạn hệ thống.
- `pageSize`: theo kiểu dữ liệu phù hợp; `page >= 1`, `pageSize` trong giới hạn hệ thống.
- `search?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.
- `role?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.
- `status?`: theo kiểu dữ liệu phù hợp; optional nếu có dấu `?`.

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
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 20,
    "totalPages": 0
  },
  "message": "OK",
  "errorCode": null
}
```

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

- Register tạo `Account` role `USER`, `Cart` và `Wallet` VND trong cùng transaction; email trùng trả `409 EMAIL_ALREADY_EXISTS`.
- Refresh token luôn lưu dạng hash, rotate token sau mỗi lần dùng; phát hiện reuse phải revoke toàn bộ token family.
- Logout thu hồi session hiện tại; logout-all thu hồi toàn bộ session còn hiệu lực của account.
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
