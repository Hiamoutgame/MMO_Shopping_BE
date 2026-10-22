# Nạp tiền ví qua SePay — Spec, bất biến và vận hành

Ngày: **23/10/2026**. Áp dụng cho `USER` (khách) và `ADMIN` (chủ shop). Code chính: [DepositService](../../src/modules/finance/services/deposit.service.ts), [SepayClientService](../../src/modules/finance/services/sepay-client.service.ts), [FinanceService](../../src/modules/finance/services/finance.service.ts), migration [AddSepayDepositTracing](../../src/database/migrations/1792000000000-AddSepayDepositTracing.ts).

**SePay** là dịch vụ theo dõi tài khoản ngân hàng: khi có tiền vào tài khoản shop, SePay gọi **webhook** (một HTTP request gửi tới server của mình) kèm nội dung chuyển khoản. Backend đọc **mã nạp** trong nội dung để biết tiền của khách nào.

## 1. Luồng chính

```text
Khách (FE /wallet)          Backend                         SePay / Ngân hàng
  │ POST /deposits 50.000 ──▶ tạo payment PENDING
  │                            mã MMOXXXXXXXXXX, hạn 30 phút
  │ ◀── QR + STK + nội dung ──┘
  │ quét QR, chuyển khoản ─────────────────────────────────▶ MB nhận tiền
  │                                                          │
  │                            POST /payments/sepay/webhook ◀┘ (Authorization: Apikey …)
  │                            1. ghi payment_webhook_events (UNIQUE id SePay)
  │                            2. khóa event → khóa payment → khóa ví
  │                            3. cộng ví + ghi ledger + payment SUCCEEDED (1 transaction)
  │ GET /deposits/:id (poll 4s) ─▶ SUCCEEDED, số dư mới
```

Dự phòng webhook bị lỡ: mỗi 5 phút backend tự gọi SePay API lấy giao dịch 2 giờ gần nhất (`SEPAY_AUTO_SYNC_INTERVAL_MS`), admin cũng có nút "Đồng bộ SePay 24h". Hai nguồn dùng chung `provider_event_id` nên không cộng trùng.

## 2. Quy tắc nghiệp vụ

| Mã | Quy tắc | Cách code thực thi |
| --- | --- | --- |
| DEP-01 | Nạp tối thiểu **10.000đ**, số nguyên VND. Tối đa kỹ thuật 1 tỷ (cấu hình được) | `CreateDepositDto` (regex số nguyên) + `DepositService.createDeposit` (min/max từ env) |
| DEP-02 | Mỗi lệnh nạp có mã riêng `MMO` + 10 ký tự A-Z0-9, sinh bằng `crypto.randomInt` | `SepayClientService.generatePaymentCode`; cột `merchant_reference` UNIQUE |
| DEP-03 | Mỗi khách tối đa 5 lệnh nạp còn hạn chưa thanh toán | `createDeposit` → HTTP 429 `TOO_MANY_PENDING_DEPOSITS` |
| DEP-04 | Bấm "Tạo mã nạp" lặp lại cùng `Idempotency-Key` → trả lại đúng lệnh cũ | `IdempotencyService` scope `deposit` |
| DEP-05 | Cộng **số tiền thực nhận**, kể cả khác số yêu cầu (lưu `requestedAmount` để đối chiếu) | `decide()` → reason `AMOUNT_MISMATCH` |
| DEP-06 | Chuyển sau khi QR hết hạn vẫn được cộng (tiền đã vào tài khoản shop) | reason `LATE_PAYMENT` |
| DEP-07 | Tiền vào < 10.000đ, mã không tồn tại, sai tài khoản nhận, hoặc chuyển 2 lần cùng mã → **không tự cộng**, chuyển `NEEDS_REVIEW` cho admin | `decide()` |
| DEP-08 | Giao dịch không có chữ `MMO` (tiền cá nhân của chủ tài khoản) → `IGNORED`, không cộng ví ai | webhook bật `skip_if_no_code`, sync chỉ lấy giao dịch có `MMO` |
| DEP-09 | Admin duyệt tay phải ghi lý do; mỗi sự kiện chỉ duyệt được một lần; có audit log | `resolveEvent` khóa event, `AuditService.log` |

## 3. Bất biến chống sai tiền

| # | Bất biến | Lớp bảo vệ (từ ngoài vào trong) |
| --- | --- | --- |
| 1 | Một giao dịch ngân hàng chỉ được cộng **một lần** dù SePay gửi lại, webhook + sync cùng lúc, hay nhiều request song song | `UNIQUE(provider, provider_event_id)` + `INSERT … ON CONFLICT` đếm `delivery_count` → khóa `FOR UPDATE` event, chỉ xử lý khi còn `RECEIVED` → payment đã `SUCCEEDED` thì không cộng lại → ledger `idempotency_key = deposit:<paymentId>` UNIQUE → `UNIQUE(payment_transaction_id)` trên ledger |
| 2 | Số dư không bao giờ âm, không bị trừ 2 lần | Khóa ví `FOR UPDATE`; kiểm tra lại idempotency **sau khi** có khóa; CHECK `balance >= 0`, `balance_after >= 0` |
| 3 | Mỗi dòng ledger đúng toán học | CHECK `chk_wallet_transactions_balance_math`: CREDIT ⇒ `after = before + amount`, DEBIT ⇒ `after = before − amount` |
| 4 | Ledger chỉ được ghi thêm, không sửa/xóa lịch sử | Trigger `trg_wallet_transactions_append_only` chặn `UPDATE`/`DELETE` |
| 5 | Số dư ví = tổng ledger; chuỗi `balance_before` nối đúng `balance_after` dòng trước | API đối soát `GET /admin/wallets/reconciliation` (dùng `ledger_seq` để sắp đúng thứ tự ghi) |

**Transaction** (giao dịch DB): nhiều câu lệnh cùng thành công hoặc cùng bị hủy. **Row lock** (`FOR UPDATE`): request sau phải chờ request trước xong mới đọc được dòng đó, nên hai request không cùng tính trên một số dư cũ.

## 4. Truy vết (trace) khi có sai sót

| Câu hỏi | Xem ở đâu |
| --- | --- |
| SePay đã báo giao dịch này chưa, báo mấy lần, payload gốc là gì? | Bảng `payment_webhook_events` (`raw_payload`, `delivery_count`, `last_received_at`); Admin → Tài chính → **Giao dịch ngân hàng** |
| Vì sao không tự cộng? | Cột `reason`: `NO_CODE`, `UNKNOWN_CODE`, `BELOW_MINIMUM`, `PAYMENT_ALREADY_COMPLETED`, `UNKNOWN_BANK_ACCOUNT`, `OUTGOING` |
| Tiền đã vào ví nào, số dư trước/sau? | `payment_webhook_events.wallet_transaction_id` → `wallet_transactions` (`balance_before`, `balance_after`, `ledger_seq`) |
| Ai duyệt tay, lúc nào, lý do? | `payment_webhook_events.resolved_by/note`, `admin_audit_logs` action `PAYMENT_EVENT_CREDIT` / `PAYMENT_EVENT_IGNORE` |
| Tổng thể có lệch không? | Admin → Tài chính → **Đối soát** |

## 5. Runbook vận hành

- **Khách báo đã chuyển nhưng chưa có tiền**: tìm mã nạp hoặc mã giao dịch ngân hàng ở tab Giao dịch ngân hàng. Không thấy → bấm "Đồng bộ SePay 24h". Vẫn không thấy → kiểm tra my.sepay.vn (Nhật ký WebHooks). Thấy `NEEDS_REVIEW` → xác minh người chuyển rồi "Cộng tiền vào ví" với Account ID đúng.
- **Khách chuyển 2 lần cùng mã**: lần 2 vào `NEEDS_REVIEW` (`PAYMENT_ALREADY_COMPLETED`). Admin cộng tay hoặc hoàn tiền ngoài hệ thống rồi "Bỏ qua" kèm ghi chú.
- **Đối soát báo lệch**: không sửa trực tiếp DB. Tìm dòng ledger/payment trong báo cáo, xác định nguyên nhân, xử lý bằng nghiệp vụ (hoàn/bù) để lịch sử vẫn đầy đủ.
- **Đổi tài khoản ngân hàng nhận**: liên kết ở SePay, sửa `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NUMBER`, `SEPAY_ACCOUNT_HOLDER` trong `.env` rồi `docker compose up -d`.

## 6. Cấu hình

| Biến | Ý nghĩa |
| --- | --- |
| `SEPAY_WEBHOOK_API_KEY` | Key SePay gửi trong header `Authorization: Apikey <key>`; phải trùng với cấu hình webhook trên my.sepay.vn |
| `SEPAY_API_TOKEN` | Token "API Access" của SePay, dùng cho sync/đối soát |
| `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NUMBER`, `SEPAY_ACCOUNT_HOLDER` | Tài khoản nhận tiền hiển thị trên QR (`qr.sepay.vn`) |
| `SEPAY_PAYMENT_PREFIX` | Tiền tố mã nạp (mặc định `MMO`), phải khớp "Cấu trúc mã thanh toán" trên SePay |
| `SEPAY_AUTO_SYNC_INTERVAL_MS` | Chu kỳ tự sync (0 = tắt) |
| `DEPOSIT_MIN_AMOUNT`, `DEPOSIT_MAX_AMOUNT`, `DEPOSIT_EXPIRES_MINUTES`, `DEPOSIT_MAX_PENDING` | Giới hạn nạp |

Cấu hình đã đặt trên SePay (23/10/2026): cấu trúc mã thanh toán `MMO` + 10 ký tự chữ/số; webhook #66025 "MMO Shopping - Nap vi" → `https://103-57-222-81.sslip.io/api/v1/payments/sepay/webhook`, chỉ tiền vào, bỏ qua giao dịch không có mã, xác thực Api Key, retry khi không phải 2xx. SePay **không gửi được tới URL `http://`** (trả 403 trước khi tới server), nên bắt buộc dùng HTTPS.
