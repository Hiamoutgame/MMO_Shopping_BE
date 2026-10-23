# API nạp tiền SePay

Nghiệp vụ và bất biến: [sepay-deposit.md](../../business/sepay-deposit.md). Mọi response dùng envelope `{ success, data, message, errorCode }` trừ webhook SePay.

## Khách (`Authorization: Bearer <accessToken>`)

| Method | URL | Mô tả |
| --- | --- | --- |
| `GET` | `/api/v1/deposits/config` | `{ enabled, minAmount, maxAmount, expiresMinutes, currency }` |
| `POST` | `/api/v1/deposits` | Tạo lệnh nạp. Header `Idempotency-Key` bắt buộc. Body `{ "amount": "50000" }` (số nguyên VND) |
| `GET` | `/api/v1/deposits?page&pageSize` | Lịch sử lệnh nạp của chính mình |
| `GET` | `/api/v1/deposits/:id` | Một lệnh nạp; FE poll 4 giây/lần cho tới khi hết `PENDING` |
| `GET` | `/api/v1/wallet` | Số dư ví |
| `GET` | `/api/v1/wallet-transactions` | Ledger ví (có `balanceBefore`, `balanceAfter`, `ledgerSeq`) |

`deposit` trả về:

```json
{
  "id": "uuid",
  "provider": "SEPAY",
  "paymentCode": "MMO35UAYWN0VN",
  "amount": "25000.0000",
  "requestedAmount": "25000.0000",
  "currency": "VND",
  "status": "PENDING",
  "isExpired": false,
  "expiresAt": "2026-10-23T06:10:00.000Z",
  "completedAt": null,
  "createdAt": "2026-10-23T05:40:00.000Z",
  "instructions": {
    "bankCode": "MBBank",
    "accountNumber": "0966949208",
    "accountHolder": "DANG QUANG HIEN",
    "amount": "25000",
    "transferContent": "MMO35UAYWN0VN",
    "qrImageUrl": "https://qr.sepay.vn/img?acc=0966949208&bank=MBBank&amount=25000&des=MMO35UAYWN0VN&template=compact"
  }
}
```

`instructions` chỉ có khi `status = PENDING`. `amount` là số đã ghi nhận (sau khi thành công là số thực nhận), `requestedAmount` là số khách yêu cầu.

| Lỗi | HTTP | `errorCode` |
| --- | --- | --- |
| Thiếu `Idempotency-Key` | 400 | `IDEMPOTENCY_KEY_REQUIRED` |
| Ngoài khoảng min/max | 400 | `DEPOSIT_AMOUNT_OUT_OF_RANGE` |
| Quá 5 lệnh chưa thanh toán | 429 | `TOO_MANY_PENDING_DEPOSITS` |
| Chưa cấu hình SePay | 503 | `PAYMENT_PROVIDER_NOT_CONFIGURED` |
| Cùng key, khác body | 409 | `IDEMPOTENCY_CONFLICT` |

## Webhook SePay (không dùng JWT)

`POST /api/v1/payments/sepay/webhook`, header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`, body theo SePay:

```json
{ "id": 92704, "gateway": "MBBank", "transactionDate": "2026-10-23 14:02:37",
  "accountNumber": "0966949208", "code": "MMO35UAYWN0VN", "content": "MMO35UAYWN0VN chuyen tien",
  "transferType": "in", "transferAmount": 25000, "accumulated": 0,
  "subAccount": null, "referenceCode": "FT26296...", "description": "" }
```

- Sai/thiếu key → `401 INVALID_SIGNATURE` (không ghi DB).
- Thiếu `id` hoặc `transferAmount` không hợp lệ → `400 INVALID_WEBHOOK_PAYLOAD`.
- Còn lại luôn `200 { "success": true, "eventId", "status", "duplicate" }`, kể cả bản gửi lại hoặc cần admin xem xét, để SePay không retry mãi.

## Admin (`Roles: ADMIN`)

| Method | URL | Mô tả |
| --- | --- | --- |
| `GET` | `/api/v1/admin/payment-webhook-events?status&search&page&pageSize` | Danh sách giao dịch ngân hàng đã nhận (trace) |
| `GET` | `/api/v1/admin/payment-webhook-events/:id` | Chi tiết, kèm `rawPayload` |
| `POST` | `/api/v1/admin/payment-webhook-events/:id/resolve` | `{ "action": "CREDIT", "accountId": "uuid", "note": "lý do" }` hoặc `{ "action": "IGNORE", "note": "..." }`. Sự kiện không còn xử lý được → `409 EVENT_NOT_RESOLVABLE` |
| `POST` | `/api/v1/admin/payments/sepay/sync` | `{ "sinceHours": 1 \| 6 \| 24 \| 72 \| 168 }` → `{ fetched, candidates, newlyProcessed, needsReview, alreadyRecorded }` |
| `GET` | `/api/v1/admin/wallets/reconciliation` | `{ ok, walletsChecked, totalBalance, eventsNeedingReview, walletMismatches[], paymentIssues[], orphanLedgers[], eventsWithoutLedger[] }` |

`POST /api/v1/callbacks/payment-providers/SEPAY` (callback HMAC chung) bị từ chối `400 UNSUPPORTED_PROVIDER`; SePay chỉ đi qua webhook ở trên.
