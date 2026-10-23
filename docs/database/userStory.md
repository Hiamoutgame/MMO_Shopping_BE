# Tài Liệu User Story

**Mô tả**: MMO Shopping là shop bán hàng số. User mua sản phẩm số bằng ví nội bộ, có thể dùng voucher giảm giá, gửi mã tiếp sức sang hệ thống tools bên ngoài, trao đổi hỗ trợ với admin và yêu cầu bảo hành.

**Roles chính**: `User`, `Admin`

> **Chung Sức hiện tại:** đọc [User Story và Business Rule Chung Sức](../business/chung-suc.md). Module campaign đang nhận mã thành PENDING và cho hủy; chưa có gọi tools hoặc thu tiền. US-USR-16/17 trong bảng cũ bên dưới mô tả thiết kế automation/SupportCodeRequest, không phải luồng campaign đã triển khai và chưa được tự động coi là cùng workflow.

> **Làm rõ nghiệp vụ — 23/10/2026:** Đây là shop do một chủ shop tự cung cấp hàng/dịch vụ. `ADMIN` chính là chủ shop, đồng thời thực hiện việc bán hàng và quản lý kho chung; khách dùng `USER`. Không có role seller độc lập trong thiết kế đích. Xem [nghiệp vụ](../business/single-owner-shop.md), [API](../api/single-owner-shop.md), [plan](../plan/single-owner-shop.md), [rule](../rule/business.md). Code đã tạm ngừng seller theo [bản thay đổi](../changes/seller-role-disabled-2026-10-23.md); tài khoản seller cũ dùng quyền USER, vẫn giữ role/dữ liệu cũ trong DB để chuyển riêng sau.

---

## 1. Role: User

| Mã          | User Story                        | Chi tiết / tiêu chí chấp nhận                                                                                                                   |
| :---------- | :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-USR-01` | Đăng ký tài khoản                 | Email là duy nhất, mật khẩu được hash, account mặc định role `USER`, tạo cart và ví VND mặc định.                                               |
| `US-USR-02` | Đăng nhập vào hệ thống            | Nhận JWT access token và refresh session; cập nhật `lastLoginAt`.                                                                               |
| `US-USR-03` | Làm mới phiên đăng nhập           | Refresh token được hash trong DB, rotate token, phát hiện reuse.                                                                                |
| `US-USR-04` | Đăng xuất                         | Thu hồi phiên hiện tại; hỗ trợ đăng xuất tất cả thiết bị.                                                                                       |
| `US-USR-05` | Xem danh sách sản phẩm đang bán   | Chỉ hiển thị product/variant active và còn khả năng bán.                                                                                        |
| `US-USR-06` | Xem chi tiết sản phẩm             | Hiển thị mô tả, ảnh, variant, giá, tồn kho khả dụng, chính sách bảo hành nếu có.                                                                |
| `US-USR-07` | Lọc danh sách sản phẩm            | V1 lọc theo category, khoảng giá, trạng thái bán, tồn kho. Rating chuyển sang V2 vì chưa có review/rating domain.                               |
| `US-USR-08` | Quản lý danh sách yêu thích       | Thêm/xóa/xem favorite; một user không favorite trùng một product.                                                                               |
| `US-USR-09` | Ghi nhận lịch sử xem              | Lưu view theo account hoặc session ẩn danh để thống kê/admin reporting.                                                                         |
| `US-USR-10` | Thêm sản phẩm vào giỏ hàng        | Cart item trỏ tới `ProductVariant`, quantity > 0, không trùng variant trong cùng cart.                                                          |
| `US-USR-11` | Nạp tiền vào ví                   | Callback cổng thanh toán idempotent, không cộng tiền hai lần.                                                                                   |
| `US-USR-12` | Thanh toán sản phẩm trong giỏ     | Trừ ví, tạo order/order item, giữ/giao inventory trong cùng workflow transaction an toàn.                                                       |
| `US-USR-13` | Áp dụng voucher khi checkout      | Voucher phải active, còn hạn, còn lượt dùng và thỏa điều kiện đơn hàng.                                                                         |
| `US-USR-14` | Xem lịch sử giao dịch và đơn hàng | User chỉ xem dữ liệu của chính mình.                                                                                                            |
| `US-USR-15` | Xem chi tiết đơn hàng             | Xem trạng thái order, payment, item đã mua, payload giao hàng theo quyền.                                                                       |
| `US-USR-16` | Nhập mã code tiếp sức             | User nhập code bất kỳ và quantity. Nếu code chưa có request thì tạo trạng thái `ACTIVE`; thanh toán xong chuyển `PROCESSING` và gửi sang tools. |
| `US-USR-17` | Xem kết quả mã tiếp sức           | API trả trạng thái tổng và `results: boolean[]`; all true = `SUCCESS`, all false = `FAILED`, mixed = `PARTIAL_SUCCESS`.                         |
| `US-USR-18` | Nhắn tin hỗ trợ admin             | V1 dùng ticket conversation qua REST polling, chưa cần WebSocket.                                                                               |
| `US-USR-19` | Yêu cầu bảo hành                  | Claim gắn với order item và inventory item đã bán, trong hạn bảo hành snapshot.                                                                 |

---

## 2. Role: Admin

| Mã          | User Story                   | Chi tiết / tiêu chí chấp nhận                                                                |
| :---------- | :--------------------------- | :------------------------------------------------------------------------------------------- |
| `US-ADM-01` | Quản lý sản phẩm             | CRUD product, category, variant, trạng thái bán và chính sách bảo hành.                      |
| `US-ADM-02` | Quản lý kho hàng số của shop | Chủ shop dùng quyền ADMIN nhập/quản lý kho chung; payload lưu mã hóa, không log dữ liệu nhạy cảm; không cần hồ sơ SELLER. |
| `US-ADM-03` | Quản lý người dùng           | CRUD/suspend account, role đích chỉ USER/ADMIN; không tự tạo role lạ, không làm mất admin hoạt động cuối cùng, không đọc/ghi mật khẩu thô. |
| `US-ADM-04` | Quản lý đơn hàng             | Xem, xử lý, cập nhật trạng thái đơn hàng, hỗ trợ hoàn tiền theo ledger.                      |
| `US-ADM-05` | Quản lý giao dịch            | Xem payment transaction và wallet ledger; mọi thay đổi tiền phải có idempotency/audit.       |
| `US-ADM-06` | Quản lý request mã tiếp sức  | Xem request, trạng thái dispatch từng tool, retry dispatch lỗi, không tạo sẵn danh mục code. |
| `US-ADM-07` | Quản lý endpoint tools       | CRUD nhiều endpoint tools, test kết nối, rotate secret; domain/secret là cấu hình của Shop.  |
| `US-ADM-08` | Quản lý ticket hỗ trợ        | Xem, trả lời, đóng/mở ticket.                                                                |
| `US-ADM-09` | Quản lý bảo hành             | Duyệt/từ chối claim, gán inventory thay thế nếu duyệt.                                       |
| `US-ADM-10` | Xem báo cáo thống kê         | Doanh thu đơn đã thanh toán, số đơn, user, tồn kho, lượt xem, request mã tiếp sức.           |
| `US-ADM-11` | Xem thông tin chung hệ thống | Dashboard tổng quan từ read model/query, không nhất thiết cần entity riêng.                  |
| `US-ADM-12` | Đăng xuất                    | Thu hồi auth session của admin.                                                              |

---

## 3. Traceability Nhanh

| Nhóm nghiệp vụ         | Entity chính                                                                  |
| :--------------------- | :---------------------------------------------------------------------------- |
| Auth/session           | `Role`, `Account`, `AuthSession`                                              |
| Catalog                | `Category`, `Product`, `ProductCategory`, `ProductVariant`                    |
| Shopping UX            | `Cart`, `CartItem`, `Favorite`, `ProductView`                                 |
| Checkout/voucher/order | `Voucher`, `VoucherRedemption`, `Order`, `OrderItem`, `InventoryItem`         |
| Wallet/payment         | `Wallet`, `PaymentTransaction`, `WalletTransaction`                           |
| Mã tiếp sức/tools      | `SupportCodeRequest`, `SupportDispatch`, `IntegrationEndpoint`, `OutboxEvent` |
| Hỗ trợ/bảo hành        | `SupportTicket`, `SupportMessage`, `WarrantyClaim`                            |
| Admin/system           | `SystemSetting`, `AdminAuditLog`                                              |
