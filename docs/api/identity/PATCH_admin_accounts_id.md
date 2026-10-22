# Admin cập nhật account

## Endpoint

- Method: `PATCH`
- URL: `/api/v1/admin/accounts/{id}`
- Module: `identity`
- Auth: `Admin`
- User stories: `US-ADM-03`

## Mô tả

Cập nhật displayName/status/role; suspend/activate và đổi role dùng endpoint này.

> **Đã triển khai tạm ngừng — 23/10/2026:** `roleCode` nếu gửi chỉ nhận USER/ADMIN; SELLER/role lạ bị từ chối HTTP 400, không tự tạo role. Account seller cũ có quyền hiệu lực USER, chỉ đổi role lưu trong DB khi admin chủ động cập nhật; guard đọc quyền từ account/session hiện tại. Bảo vệ admin hoạt động cuối cùng vẫn là việc chưa triển khai trong [plan](../../plan/single-owner-shop.md). Xem [bản thay đổi](../../changes/seller-role-disabled-2026-10-23.md); JSON dưới đây là đặc tả thiết kế, format lỗi thực tế vẫn theo filter chung.

## Request

### Path params

- `id`: UUID/string định danh tài nguyên trong URL.

### Query params

- Không có.

### Body

- `displayName?`: bắt buộc trừ khi có dấu `?`.
- `status?`: bắt buộc trừ khi có dấu `?`.
- `roleCode?`: tùy chọn, enum đích `USER` hoặc `ADMIN`.

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
    "account": {
      "id": "8f8f7a6e-62c7-4c2f-95bc-33d8312e7a7a"
    }
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
- Response phải dùng envelope chuẩn và chỉ trả dữ liệu thuộc quyền truy cập của caller.

## Idempotency

Không yêu cầu idempotency key riêng; vẫn phải tránh tạo trùng bằng unique constraint/domain constraint nếu có.

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
