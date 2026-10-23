# Tạm ngừng role seller — 23/10/2026

Theo yêu cầu chủ dự án, quyền đang hỗ trợ là **`USER`** (khách) và **`ADMIN`** (chủ shop). Đợt này thay đổi code; không xóa bảng, tài khoản hoặc lịch sử seller và không chạy cập nhật database thật.

## Hành vi đã triển khai

| Phần | Hành vi mới | Source |
| --- | --- | --- |
| Tạo/sửa account | DTO và service chỉ nhận USER/ADMIN; role lạ bị từ chối, không tự tạo role từ input. Role hợp lệ phải được khởi tạo bằng seed trước | [DTO tạo](../../MMO_Shopping_BE/src/modules/identity/dto/create-account.dto.ts), [DTO sửa](../../MMO_Shopping_BE/src/modules/identity/dto/update-account.dto.ts), [AccountService](../../MMO_Shopping_BE/src/modules/identity/services/account.service.ts), `resolveAssignableRole` |
| Danh sách role | Chỉ công bố USER/ADMIN; không đưa SELLER cũ vào lựa chọn phân quyền | [RoleService](../../MMO_Shopping_BE/src/modules/identity/services/role.service.ts), `findAll` |
| Tài khoản seller cũ | Đăng nhập/refresh và phiên đang dùng có quyền khách USER; chỉ role ADMIN được lưu rõ ràng mới có quyền admin. Role khác/không xác định cũng không được nâng quyền | [policy](../../MMO_Shopping_BE/src/common/auth/account-role.ts), [AuthService](../../MMO_Shopping_BE/src/modules/identity/services/auth.service.ts), [JwtAuthGuard](../../MMO_Shopping_BE/src/common/guards/jwt-auth.guard.ts), [RolesGuard](../../MMO_Shopping_BE/src/common/guards/roles.guard.ts) |
| Token cũ | Guard đọc account/role từ session trong DB thay vì tin quyền cũ trong token; API admin vẫn kiểm tra quyền riêng | `JwtAuthGuard.canActivate`, `RolesGuard.canActivate` |
| API seller | Toàn bộ namespace `/api/v1/sellers` trả HTTP 410 với `FEATURE_RETIRED`; controller không gọi service/repository seller, không xuất hiện trong Swagger | [SellersController](../../MMO_Shopping_BE/src/modules/sellers/controllers/sellers.controller.ts) |
| Giá Chung Sức | Gỡ mã/repository/nhánh giảm giá seller; mọi account mua theo chính sách giá USER, gồm admin thử mua; giữ tính giá theo số lượng, mùa, gói, coupon và giá sàn | [PriceEngineService](../../MMO_Shopping_BE/src/modules/pricing/services/price-engine.service.ts), `calculatePrice` |
| API báo giá | Yêu cầu phiên MMO; lấy account từ phiên. `accountId` do client cũ gửi được chấp nhận để tương thích nhưng bị bỏ qua; `sellerCode` bị validation từ chối | [PricingController](../../MMO_Shopping_BE/src/modules/pricing/controllers/pricing.controller.ts), [CalculatePriceDto](../../MMO_Shopping_BE/src/common/dto/chung-suc.dto.ts) |
| Voucher cũ | Voucher chỉ áp dụng SELLER hoặc không có USER trong danh sách đối tượng không được áp dụng cho khách; danh sách có USER vẫn giữ hiệu lực theo các điều kiện khác | Price Engine, [CommerceService](../../MMO_Shopping_BE/src/modules/commerce/services/commerce.service.ts), `getVoucherResult`; [CouponsService](../../MMO_Shopping_BE/src/modules/coupons/services/coupons.service.ts), `validateCoupon` |
| Seed | Không tạo role/account/profile/code/tier seller mới. Gói/voucher seed mới dành cho USER; script seed role chỉ khởi tạo USER/ADMIN | [seed-roles.js](../../MMO_Shopping_BE/scripts/seed-roles.js), [ChungSucSeedService](../../MMO_Shopping_BE/src/database/seeds/chung-suc-seed.service.ts) |
| Frontend | Bỏ API/kiểu dữ liệu seller đang dùng ở phần cũ; trang seller giữ placeholder không gọi API và không có route. Form/lọc account chỉ hỗ trợ USER/ADMIN; báo giá không gửi accountId/sellerCode | [AdminAccountsPage](../../MMO_Shopping_FE/src/pages/admin/AdminAccountsPage.tsx), [SellerDashboardPage](../../MMO_Shopping_FE/src/pages/seller/SellerDashboardPage.tsx), [JoinChungSucPage](../../MMO_Shopping_FE/src/pages/chung-suc/JoinChungSucPage.tsx) |

**Quyền hiệu lực** là quyền backend dùng khi xử lý request. Tài khoản cũ vẫn có thể lưu `role_id` trỏ tới SELLER trong DB, nhưng quyền hiệu lực là USER. `/auth/me` tra role USER chính thức để trả thông tin tương ứng; không giả mạo ID role cũ thành USER. Admin vẫn có thể xem vai trò cũ trong chi tiết account. Bộ lọc USER bao gồm các account có quyền khách; khi admin chủ động lưu form sửa account seller cũ, form ghi rõ sẽ chuyển vai trò lưu thành USER.

## Dữ liệu và giới hạn

- Không chạy seed, migration hoặc SQL trên DB thật trong đợt này. Các bảng/quan hệ seller và dữ liệu lịch sử được giữ để có thể xem xét phục hồi hoặc chuyển dữ liệu sau.
- Entity `Voucher` được bổ sung mapping tới cột `applicable_roles` đã có trong migration `AddChungSucSystem`; không tạo migration mới hoặc bật `synchronize`. Môi trường chạy cần các migration hiện có của dự án.
- Kho chung của shop vẫn do ADMIN quản lý. Kết nối Hoàn Phí theo từng khách được giữ riêng; không cần SELLER để liên kết provider.
- Chuẩn hóa lỗi HTTP chung, bảo vệ admin hoạt động cuối cùng, dọn analytics và migration/archive seller toàn diện vẫn là các việc riêng trong [plan](../plan/single-owner-shop.md). Đợt tạm ngừng này không hoàn tất toàn bộ plan đó.
- Test tự động dùng mock DB/provider và HTTP app cô lập. Chưa xác minh môi trường triển khai, dữ liệu thật hoặc đăng nhập Hoàn Phí live.

## Kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Backend build | Đạt |
| Backend lint | Đạt, 0 lỗi và 0 cảnh báo |
| Backend toàn bộ test | 22 suite, 90 test đạt; baseline là 18 suite, 55 test |
| HTTP test sau chỉnh kiểu dữ liệu test | 2 suite, 19 test đạt |
| Frontend build | Đạt |
| Frontend lint | Còn 14 lỗi và 1 cảnh báo ở phần cũ; baseline là 20 lỗi và 2 cảnh báo. Chưa làm sạch lint toàn bộ frontend |

Lệnh đã chạy: BE `npm run build`, ESLint theo cùng glob của `npm run lint`, `npm test -- --runInBand`; FE `npm run build`, `npm run lint`. Backend lint được đối chiếu với bản source trước sửa, cũng có 0 lỗi/cảnh báo. Lỗi frontend còn lại nằm ở `PackagesPage.tsx`, `SeasonsPage.tsx`, `services/api.ts`, `types/chung-suc.types.ts`; chưa mở rộng đợt này thành dọn các phần không liên quan đến seller.

Các test bổ sung kiểm tra API seller trả 410 qua HTTP thật trên app test; DTO/service từ chối role seller; tài khoản/token cũ dùng quyền USER; account seller không vào admin; báo giá không dùng account giả hoặc sellerCode; chính sách giá khách vẫn áp dụng cho tài khoản cũ/admin.
