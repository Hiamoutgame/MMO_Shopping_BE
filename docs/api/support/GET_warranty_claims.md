# User liệt kê warranty claim

## Endpoint

- Method: `GET`
- URL: `/api/v1/warranty-claims`
- Module: `support`
- Auth: `User`
- User stories: `US-USR-19`

## Mô tả

Liệt kê claim của user hiện tại.

## Request

### Path params

- Không có.

### Query params

- `page`: theo kiểu dữ liệu phù hợp; `page >= 1`, `pageSize` trong giới hạn hệ thống.
- `pageSize`: theo kiểu dữ liệu phù hợp; `page >= 1`, `pageSize` trong giới hạn hệ thống.
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

- Ticket V1 dùng REST polling; user chỉ xem ticket/claim của chính mình, admin xem toàn hệ thống.
- Warranty claim phải gắn với order item thuộc user, inventory đã bán và còn hạn bảo hành snapshot.
- Admin approve/reject/fulfill warranty phải audit; replacement inventory không được cấp trùng.
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

Không bắt buộc, trừ khi service phát sinh thay đổi tiền/order do workflow nội bộ.

## Liên kết

- Conventions: [../conventions.md](../conventions.md)
- Source: [../../database/userStory.md](../../database/userStory.md), [../../database/entities.md](../../database/entities.md)
