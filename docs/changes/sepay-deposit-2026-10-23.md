# Nạp tiền ví qua SePay — 23/10/2026

Nhánh `feature/sepay-wallet-deposit` (BE và FE), tách từ `fix/cleanup-and-chung-suc-admin`. Spec: [sepay-deposit.md](../business/sepay-deposit.md). API: [sepay-deposit-api.md](../api/finance/sepay-deposit-api.md).

## Thay đổi

| Phần | Nội dung |
| --- | --- |
| DB | Migration `1792000000000-AddSepayDepositTracing`: enum `SEPAY`, `payment_transactions.expires_at`, bảng `payment_webhook_events`, `wallet_transactions.ledger_seq`, CHECK toán học số dư (`NOT VALID` cho dữ liệu cũ), trigger chặn sửa/xóa ledger |
| BE | `DepositService` (tạo lệnh, xử lý giao dịch ngân hàng, duyệt tay, sync), `SepayClientService` (Apikey, mã nạp, QR, gọi SePay API), `FinanceService.reconcile`, kiểm tra lại idempotency sau khi khóa ví, chặn SEPAY ở callback HMAC chung, `TRUST_PROXY` để audit log có IP thật |
| FE | Trang `/wallet` (số dư, tạo mã nạp, QR + đếm ngược + tự cập nhật, lịch sử nạp, biến động số dư), link "Ví" trên header; Admin → Tài chính thêm tab **Giao dịch ngân hàng** (lọc, xem payload, cộng tay/bỏ qua, đồng bộ SePay) và **Đối soát** |
| Hạ tầng | `docker-compose.yml` thêm biến SePay, app chỉ nghe `127.0.0.1` (`APP_BIND`) |

`createDeposit` cũ trong `FinanceService` (adapter `BANK_TRANSFER_MOCK`) đã gỡ; `POST /deposits` không còn nhận `provider`/`currency`.

## Kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Unit `sepay-client.service.spec.ts` | 26 test đạt |
| Integration `deposit.integration.spec.ts` trên PostgreSQL 16 thật (`TEST_DATABASE_URL`) | 21 test đạt: min 10k, idempotency tạo lệnh, giới hạn lệnh treo, 10 webhook trùng song song → cộng 1 lần, webhook + sync cùng giao dịch, chuyển 2 lần cùng mã, lệch số tiền, chuyển muộn, tiền ra/không mã/sai mã/sai tài khoản, dưới mức tối thiểu, 2 admin duyệt cùng lúc, 20 lệnh trừ song song không âm, retry trừ tiền cùng key, DB chặn sửa ledger và dòng sai toán học, đối soát phát hiện ví bị sửa tay |
| Toàn bộ test BE (không DB) | 24 suite đạt, integration tự bỏ qua khi không có `TEST_DATABASE_URL` |
| BE build, lint file thay đổi | Đạt |
| FE `tsc -b`, lint file thay đổi, build | Đạt |
| SePay "Gửi thử" webhook → VPS qua HTTPS | HTTP 200, sự kiện được lưu |
| E2E trên VPS qua HTTPS (đăng ký → nạp 25.000 → 5 webhook trùng song song → số dư → admin bỏ qua sự kiện test → sync SePay API → đối soát) | 17/17 đạt; sau đó đã xóa volume DB để production không chứa tiền giả |

Chưa kiểm chứng: chuyển khoản tiền thật từ app ngân hàng (cần chủ tài khoản thực hiện 10.000đ), giao diện FE trên trình duyệt thật (mới kiểm tra bằng typecheck/build).

Chạy integration test:

```bash
docker run -d --name mmo-test-pg -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=mmo_test -p 127.0.0.1:55432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgresql://postgres:testpass@127.0.0.1:55432/mmo_test npx jest deposit.integration
```

Suite xóa toàn bộ schema `public` của DB được trỏ tới — **không** trỏ vào DB thật.
