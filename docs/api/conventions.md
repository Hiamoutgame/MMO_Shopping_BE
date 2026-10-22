# API V1 Conventions

## Phạm vi

Tài liệu này định nghĩa hợp đồng thiết kế API V1 cho MMO Shopping. Base URL là `/api/v1`. Backend đã có controller NestJS và cấu hình Swagger; đặc tả không tự chứng minh mọi ràng buộc đã được triển khai. Đối chiếu source và test khi kết nối.

## Mô hình quyền của shop — 23/10/2026

- Theo [nghiệp vụ](../business/single-owner-shop.md), shop có một chủ thể bán; `ADMIN` là chủ shop, `USER` là khách. Admin quản lý kho của shop, không cần role seller.
- API cá nhân lấy account từ phiên và kiểm tra chủ sở hữu; API vận hành kiểm tra ADMIN. Tên URL không thay thế guard. Đăng ký công khai không được chọn role.
- Gán/list role hiện chỉ hỗ trợ `USER`/`ADMIN`; tài khoản seller cũ dùng quyền khách trong runtime. Bảng/entity seller còn giữ lịch sử. Xem [bản triển khai tạm ngừng](../changes/seller-role-disabled-2026-10-23.md) và [plan](../plan/single-owner-shop.md).
- Namespace seller đã trả `410 FEATURE_RETIRED` trong code; chỉ khi gỡ route sau này mới dự kiến `404`. Giữ cashback referrals và mã mời Chung Sức theo nghiệp vụ riêng.
- Tuân thủ [rule nghiệp vụ](../rule/business.md) bên cạnh các quy tắc kỹ thuật dưới đây.

## Auth

- Public endpoint không yêu cầu token.
- User/Admin endpoint dùng `Authorization: Bearer <accessToken>`.
- Refresh token gửi trong body ở `POST /api/v1/auth/refresh` để tương thích frontend hiện tại.
- Callback payment/tool không dùng JWT; bắt buộc verify HMAC-SHA256 signature, timestamp và raw request body.

## Envelope

```json
{
  "success": true,
  "data": {},
  "message": "OK",
  "errorCode": null
}
```

List response:

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

Error response:

```json
{
  "success": false,
  "data": null,
  "message": "Readable error message",
  "errorCode": "VALIDATION_ERROR"
}
```

## Kiểu dữ liệu

- UUID: string UUID.
- Datetime: ISO 8601.
- Money: decimal string tương thích `numeric(19,4)`.
- Currency: `VND` mặc định.
- Enum: giá trị viết hoa theo `docs/database/entities.md`.
- Pagination: `page >= 1`, `pageSize` theo giới hạn hệ thống.

## Error code chuẩn

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `EMAIL_ALREADY_EXISTS`
- `INVALID_CREDENTIALS`
- `REFRESH_TOKEN_REUSED`
- `INSUFFICIENT_FUNDS`
- `OUT_OF_STOCK`
- `VOUCHER_INVALID`
- `IDEMPOTENCY_REPLAYED`
- `CONCURRENT_MODIFICATION`
- `SIGNATURE_INVALID`

## Idempotency & concurrency

- `Idempotency-Key` bắt buộc cho checkout, refund, support-code pay/retry và `POST /api/v1/deposits`; callback dùng provider transaction id qua shared `IdempotencyRecord`.
- Wallet, inventory, voucher redemption và warranty replacement phải dùng DB transaction với row lock hoặc atomic conditional update.
- Không gọi HTTP external API bên trong DB transaction; ghi `OutboxEvent` rồi worker xử lý sau commit.
- Callback lặp phải trả kết quả đã xử lý trước đó và không ghi ledger/giao hàng lần hai.

## Redaction

API không trả `passwordHash`, refresh-token hash, inventory payload mã hóa, tool credentials, secret diff trong audit, hoặc delivery payload ngoài quyền sở hữu.

## File endpoint bắt buộc có

Mỗi endpoint Markdown phải có các mục: `Endpoint`, `Mô tả`, `Request`, `Validation`, `Response`, `Ràng buộc nghiệp vụ`, `Idempotency`, `Transaction & concurrency`, `Dữ liệu nhạy cảm`, `Audit`.
