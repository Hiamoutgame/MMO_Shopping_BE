# User tạo warranty claim

## Endpoint

- Method: `POST`
- URL: `/api/v1/warranty-claims`
- Module: `support`
- Auth: `User`
- User stories: `US-USR-19`

## Mô tả

Tạo claim cho order item và inventory đã bán còn bảo hành.

## Request

### Path params

- Không có.

### Query params

- Không có.

### Body

- `orderItemId`: bắt buộc trừ khi có dấu `?`.
- `inventoryItemId`: bắt buộc trừ khi có dấu `?`.
- `reason`: bắt buộc trừ khi có dấu `?`.
- `evidence?`: bắt buộc trừ khi có dấu `?`.

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

### Success `201`

```json
{
  "success": true,
  "data": {
    "warrantyClaim": {
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

- Ticket V1 dùng REST polling; user chỉ xem ticket/claim của chính mình, admin xem toàn hệ thống.
- Warranty claim phải gắn với order item thuộc user, inventory đã bán và còn hạn bảo hành snapshot.
- Admin approve/reject/fulfill warranty phải audit; replacement inventory không được cấp trùng.
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

Không bắt buộc, trừ khi service phát sinh thay đổi tiền/order do workflow nội bộ.

## Liên kết

- Conventions: [../conventions.md](../conventions.md)
- Source: [../../database/userStory.md](../../database/userStory.md), [../../database/entities.md](../../database/entities.md)
