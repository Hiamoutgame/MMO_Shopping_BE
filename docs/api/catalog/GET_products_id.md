# Chi tiết sản phẩm public

## Endpoint

- Method: `GET`
- URL: `/api/v1/products/{id}`
- Module: `catalog`
- Auth: `Public`
- User stories: `US-USR-06`

## Mô tả

Trả mô tả, ảnh, category, variant, tồn kho khả dụng và chính sách bảo hành.

## Request

### Path params

- `id`: UUID/string định danh tài nguyên trong URL.

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
    "product": {
      "id": "8f8f7a6e-62c7-4c2f-95bc-33d8312e7a7a",
      "name": "ChatGPT Plus 1 tháng",
      "slug": "chatgpt-plus-1-thang",
      "description": "Tài khoản ChatGPT Plus dùng trong 1 tháng.",
      "imageUrls": ["https://cdn.example.com/1.png"],
      "status": "ACTIVE",
      "minPrice": "190000",
      "totalAvailable": 12,
      "categories": [
        { "id": "cat-ai-uuid", "name": "Tài khoản AI", "slug": "tai-khoan-ai" }
      ],
      "variants": [
        {
          "id": "variant-uuid",
          "sku": "SKU-001",
          "name": "1 tháng",
          "price": "190000",
          "currency": "VND",
          "status": "ACTIVE",
          "fulfillmentType": "AUTO",
          "availableQuantity": 12
        }
      ],
      "createdAt": "2026-08-27T00:00:00.000Z",
      "updatedAt": "2026-08-27T00:00:00.000Z"
    }
  },
  "message": "OK",
  "errorCode": null
}
```

`variants` chỉ chứa variant `ACTIVE` + fulfillment `AUTO`, chưa soft delete; `price` là decimal string. `minPrice` là giá thấp nhất trong các variant còn bán được.

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

- Public list chỉ trả `Product`/`ProductVariant` `ACTIVE`, chưa soft delete và còn khả năng bán.
- V1 không có domain đánh giá, nên không nhận filter theo điểm đánh giá.
- Admin thay đổi product/category/variant phải ghi `AdminAuditLog`.
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

Không bắt buộc, trừ khi service phát sinh thay đổi tiền/order do workflow nội bộ.

## Liên kết

- Conventions: [../conventions.md](../conventions.md)
- Source: [../../database/userStory.md](../../database/userStory.md), [../../database/entities.md](../../database/entities.md)
