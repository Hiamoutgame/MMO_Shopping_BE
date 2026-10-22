# Admin tạo inventory

## Endpoint

- Method: `POST`
- URL: `/api/v1/admin/inventory-items`
- Module: `inventory`
- Auth: `Admin`
- User stories: `US-ADM-02`

## Mô tả

Chủ shop dùng quyền `ADMIN` nhập một đơn vị hàng số cho variant vào kho chung của shop; không cần account/hồ sơ `SELLER`.

> **Đối chiếu source 23/10/2026:** `CreateInventoryItemDto` và `InventoryService.create()` hiện hỗ trợ một item mỗi request. Frontend gửi `payload` dạng object, backend mã hóa trước khi lưu, trả `data.inventoryItem` đã loại payload. API nhập hàng loạt chưa có trong contract này. Xem [API shop một chủ](../single-owner-shop.md).

## Request

### Path params

- Không có.

### Query params

- Không có.

### Body

- `productVariantId`: UUID bắt buộc, trỏ variant đang bán.
- `payload`: object bắt buộc chứa nội dung hàng số; không gửi `encryptedPayload`.
- `metadata?`: object tùy chọn, không đặt secret/payload vào metadata.

Ví dụ giả định:

```json
{
  "productVariantId": "8f8f7a6e-62c7-4c2f-95bc-33d8312e7a7a",
  "payload": { "activationCode": "EXAMPLE-ONLY" },
  "metadata": { "batch": "example-batch" }
}
```

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
    "inventoryItem": {
      "id": "c10167bb-2b7d-4f04-961b-c9bfc5aed272",
      "productVariantId": "8f8f7a6e-62c7-4c2f-95bc-33d8312e7a7a",
      "orderItemId": null,
      "status": "AVAILABLE",
      "metadata": { "batch": "example-batch" },
      "encryptionKeyVersion": 1
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

- `InventoryItem.encryptedPayload` không bao giờ xuất hiện trong list response; detail admin cũng chỉ trả metadata giao hàng đã được redaction.
- Status transition phải hợp lệ: `AVAILABLE -> RESERVED -> SOLD`, `AVAILABLE/RESERVED -> VOID`; không chuyển `SOLD` về `AVAILABLE`.
- Mỗi thay đổi inventory của admin phải ghi audit.
- Response phải dùng envelope chuẩn và chỉ trả dữ liệu thuộc quyền truy cập của caller.

## Idempotency

Không yêu cầu idempotency key riêng; vẫn phải tránh tạo trùng bằng unique constraint/domain constraint nếu có.

## Transaction & concurrency

- Hiện `InventoryService.create()` lưu item rồi ghi audit bằng hai lệnh riêng; chưa thấy transaction bao cả hai trong hàm này. Ví dụ response chỉ minh họa một phần field, không phải kết quả runtime đã kiểm tra.
- Yêu cầu đích khi hoàn thiện: item và audit phải nhất quán, tránh nhập trùng khi retry; không coi mục Idempotency là bảo đảm đã có chống nhập trùng.
- Cơ chế chống giao trùng ở checkout cần kiểm tra riêng; việc nhập được hàng chưa chứng minh toàn bộ workflow đã an toàn đồng thời.

## Dữ liệu nhạy cảm

- Không trả `passwordHash`, refresh-token hash, `encryptedPayload`, tool credentials hoặc payload giao hàng của user khác.
- Secret/config nhạy cảm phải redacted trong response và audit diff.

## Audit

Có. Ghi `AdminAuditLog` cho thao tác tạo/cập nhật/xóa hoặc thay đổi tiền/order/inventory/integration/warranty.

## Liên kết

- Conventions: [../conventions.md](../conventions.md)
- Source: [../../database/userStory.md](../../database/userStory.md), [../../database/entities.md](../../database/entities.md)
