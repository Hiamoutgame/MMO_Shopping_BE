# Kế hoạch làm rõ mô hình một chủ shop

Ngày lập: **23/10/2026**. Mục tiêu: đưa nghiệp vụ, API, frontend, dữ liệu và rule về cùng mô hình bạn tự bán hàng với quyền `ADMIN`, khách mua với quyền `USER`.

**Phạm vi công việc đã làm trong đợt tài liệu:** đọc source, xác định khác biệt, viết bộ docs bốn phần và đánh dấu tài liệu cũ. Các checkbox sửa code/data dưới đây là công việc tiếp theo; không có nghĩa đã triển khai.

> **Cập nhật theo yêu cầu tạm bỏ role seller:** Đã triển khai một phần plan trong source: chặn gán role seller mới, API seller trả 410, seed/pricing không tạo/dùng seller, frontend dùng USER/ADMIN. Chọn tương thích tạm thời: account seller cũ có quyền hiệu lực USER, không tự chuyển `role_id` hoặc xóa bảng. Xem [hành vi và kiểm tra](../changes/seller-role-disabled-2026-10-23.md). Các bước migration, archive/drop, bảo vệ admin cuối cùng, rà analytics và triển khai thật vẫn chưa thực hiện.

Đọc [nghiệp vụ](../business/single-owner-shop.md), [API](../api/single-owner-shop.md), [rule](../rule/business.md) trước khi bắt đầu.

## 1. Quyết định và giới hạn

- Shop là chủ thể duy nhất cung cấp hàng/dịch vụ. `ADMIN` quản trị việc bán hàng và kho chung của shop; không cần role `SELLER`.
- Ngừng seller nội bộ, hồ sơ chờ duyệt, mã seller, ưu đãi dựa vào seller và hướng phát triển chia hoa hồng seller.
- Giữ catalog, kho, giỏ, ví, đơn, voucher, hỗ trợ/bảo hành. Giữ Chung Sức là tiếp sức mã mời game và giữ Hoàn Phí 247 độc lập.
- Chưa thêm role, bảng shop, tenant hoặc hệ thống phân chia tiền. **Tenant** là một bên sở hữu dữ liệu riêng trong hệ thống; hiện dự án không cần mô hình mỗi người bán là một tenant.
- Không viết lại toàn bộ pricing/checkout hoặc gộp automation cũ với campaign trong cùng đợt. Khác biệt hai luồng giá phải được ghi nhận và kiểm tra.

## 2. Bản đồ phần bị ảnh hưởng

| Phần | File/điểm vào đã kiểm tra | Việc cần làm |
| --- | --- | --- |
| Đăng ký API seller | [AppModule](../../MMO_Shopping_BE/src/app.module.ts), [SellersModule](../../MMO_Shopping_BE/src/modules/sellers/sellers.module.ts), [SellersController](../../MMO_Shopping_BE/src/modules/sellers/controllers/sellers.controller.ts) | Chặn truy cập chức năng trước, gỡ module sau |
| Account/role | [AccountService](../../MMO_Shopping_BE/src/modules/identity/services/account.service.ts), [CreateAccountDto](../../MMO_Shopping_BE/src/modules/identity/dto/create-account.dto.ts), [UpdateAccountDto](../../MMO_Shopping_BE/src/modules/identity/dto/update-account.dto.ts) | Chỉ cho role `USER`/`ADMIN`; không tự sinh role từ input |
| Seed | [seed-roles.js](../../MMO_Shopping_BE/scripts/seed-roles.js), [ChungSucSeedService](../../MMO_Shopping_BE/src/database/seeds/chung-suc-seed.service.ts), [SeedModule](../../MMO_Shopping_BE/src/database/seeds/seed.module.ts) | Bỏ tạo seller/profile/code/tier mới; giữ seed dịch vụ cần thiết |
| Giá Chung Sức | [PriceEngineService](../../MMO_Shopping_BE/src/modules/pricing/services/price-engine.service.ts), [PricingModule](../../MMO_Shopping_BE/src/modules/pricing/pricing.module.ts), [ChungSucService](../../MMO_Shopping_BE/src/modules/chung-suc/services/chung-suc.service.ts) | Tháo repository/code/rule seller nhưng giữ `joinCampaign` báo giá |
| Giá checkout | [CommerceService](../../MMO_Shopping_BE/src/modules/commerce/services/commerce.service.ts), `checkout`, `calculateSubtotal` | Giữ nguồn giá variant và tính tiền ở server |
| Lịch sử/schema | [migration AddChungSucSystem](../../MMO_Shopping_BE/src/database/migrations/1788600000000-AddChungSucSystem.ts), [Order](../../MMO_Shopping_BE/src/modules/commerce/entities/order.entity.ts), [ProfitRecord](../../MMO_Shopping_BE/src/modules/analytics/entities/profit-record.entity.ts) | Đối chiếu cột DB, FK và lịch sử seller trước khi xóa |
| Analytics | [AnalyticsController](../../MMO_Shopping_BE/src/modules/analytics/controllers/analytics.controller.ts), [AnalyticsService](../../MMO_Shopping_BE/src/modules/analytics/services/analytics.service.ts) | Rà quyền API lợi nhuận, bỏ filter seller khỏi hợp đồng mới; giữ lịch sử |
| FE phần cũ | [SellerDashboardPage](../../MMO_Shopping_FE/src/pages/seller/SellerDashboardPage.tsx), [services/api.ts](../../MMO_Shopping_FE/src/services/api.ts), [types](../../MMO_Shopping_FE/src/types/chung-suc.types.ts) | Rà import/consumer rồi gỡ phần seller; không xóa cả file dùng chung |
| FE đang chạy | [AppRouter](../../MMO_Shopping_FE/src/routes/index.tsx), [RequireAdmin](../../MMO_Shopping_FE/src/components/RequireAdmin/RequireAdmin.tsx), [httpClient](../../MMO_Shopping_FE/src/common/apis/httpClient.ts) | Giữ admin shop, kiểm tra role mapping và API đang dùng |

## 3. Giai đoạn 0 — tài liệu và kiểm kê

- [x] Chốt mô hình từ yêu cầu chủ dự án, giải thích role và quyền quản lý kho.
- [x] Tạo tài liệu nghiệp vụ, API, plan, rule và mục lục đọc.
- [x] Đối chiếu route seller, router FE, seed, pricing, checkout và quan hệ dữ liệu trong source.
- [x] Đánh dấu tài liệu seller cũ là lịch sử; liên kết tài liệu cốt lõi tới mô hình mới.
- [x] Khi bắt đầu sửa code: ghi baseline build/lint/test của BE/FE, phân biệt lỗi sẵn có và lỗi mới.
- [ ] Kiểm kê DB bằng truy vấn chỉ đọc: migration đã áp dụng, account theo role, profile/code/click, cột seller trong orders/profit, price tier/rule/package/voucher có `SELLER`.
- [ ] Rà consumer ngoài workspace, log truy cập endpoint, phiên/token seller và tác vụ nền trước khi định lịch ngừng API.

Đầu ra kiểm kê cần có số lượng, tên quan hệ và tác động; không đưa payload hàng số, secret hoặc dữ liệu đăng nhập vào báo cáo. Hiện chưa truy cập DB nên chưa có số lượng thực tế.

**Hoàn tất khi:** có bản kiểm kê và baseline để biết phần nào thật sự đang dùng. Không ước lượng “seller chỉ là demo” khi chưa đọc dữ liệu.

## 4. Giai đoạn 1 — ngừng mở rộng seller và khóa API cũ

- [x] Tạo lớp trả `410 FEATURE_RETIRED` cho toàn bộ route seller theo [danh sách API](../api/single-owner-shop.md), không đọc/ghi seller; không chỉ ẩn UI.
- [x] Giữ bảng/entity cũ; Price Engine và SeedModule đã tháo đăng ký entity seller. Module seller còn được nạp để giữ namespace 410 và metadata entity lịch sử, không phục vụ API seller cũ.
- [x] Tạo/sửa account chỉ chấp nhận `USER`, `ADMIN`; sửa cả validation DTO và service. `GET /admin/roles` chỉ công bố role hỗ trợ theo hợp đồng đích.
- [ ] Chặn tự nâng quyền ở register; bảo vệ account admin hoạt động cuối cùng khi khóa/xóa/đổi role, kể cả request đồng thời.
- [x] Sửa hai đường seed để không tạo lại seller, mã giới thiệu hoặc ưu đãi seller. Chưa chạy seed trên DB thật; vẫn cần kiểm tra runtime trước khi dùng với dữ liệu thật.
- [ ] Rà API analytics quản trị: controller đã đọc chưa khai báo guard ở cấp class; các endpoint lợi nhuận/thao tác quản trị phải kiểm tra admin khi tiếp tục sử dụng.

**Hoàn tất khi:** route seller không thực hiện được thao tác với guest/USER/ADMIN; không tạo được role seller mới qua API hoặc seed; chủ shop vẫn vào được khu vực admin.

## 5. Giai đoạn 2 — tháo seller khỏi giá và chuẩn bị chuyển role

- [x] Bỏ `sellerCode`, repository `SellerReferralCode` và nhánh giảm giá seller trong `PriceEngineService`/`PricingModule`.
- [ ] Giữ báo giá Chung Sức theo product, số lượng và season hiện có; so sánh snapshot trước/sau cho yêu cầu hợp lệ.
- [x] Dùng chính sách giá khách hàng khi admin thử mua. Không dùng role phân quyền để tự động suy ra giá ưu đãi seller.
- [ ] Rà `PriceTier.roleCode`, `PriceRule.applicableRoles`, package và voucher; xử lý trường hợp danh sách gồm cả `USER` và `SELLER` khác với chỉ có `SELLER`.
- [ ] Nếu danh sách chỉ có `SELLER`, vô hiệu hóa rule/package/voucher tương ứng hoặc ghi rõ quyết định chuyển đổi; không xóa phần tử để thành danh sách rỗng nếu rỗng có nghĩa áp dụng cho mọi người.
- [ ] Giữ checkout hàng số tính từ variant; chưa hợp nhất nó với Price Engine. Nếu giữ `POST /pricing/calculate`, lấy account từ phiên, dùng DTO được validate, không tin `accountId` client gửi.
- [ ] Lập mapping account seller cũ sang `USER` cho quyền mới. Chủ shop được xác định riêng; không bulk-promote seller sang admin.

**Hoàn tất khi:** không thể áp ưu đãi seller bằng mã, role hoặc dữ liệu rule còn sót; Chung Sức vẫn báo giá được; checkout không đổi số tiền ngoài thay đổi đã được mô tả.

## 6. Giai đoạn 3 — chuyển dữ liệu có kiểm soát

**Migration** là bước đổi schema/dữ liệu DB. Tách hai lần phát hành: lần đầu ngừng sử dụng/chuyển quyền nhưng giữ cấu trúc cũ; lần sau mới cân nhắc bỏ bảng/cột. Cách này cho phép kiểm tra và khôi phục trước khi mất dữ liệu.

- [ ] Tạo backup và xác nhận khôi phục được trên môi trường thử trước khi áp dụng chuyển dữ liệu thật.
- [ ] Viết migration mới; không sửa migration cũ đã phát hành, không dùng `synchronize: true`.
- [ ] Chuyển account `SELLER` theo mapping sang `USER`, giữ nguyên account ID, ví, đơn, liên kết cashback và các quan hệ cá nhân. Không hạ quyền account chủ shop đã xác định là admin.
- [ ] Thu hồi/làm mới session bị ảnh hưởng để token cũ không tiếp tục mang quyền/giá seller. Kiểm tra từng guard/consumer thực tế thay vì giả định tất cả đều đọc role mới từ DB.
- [ ] Vô hiệu hóa code/rule seller theo phương án đã đối chiếu ở giai đoạn 2; ghi log chuyển đổi không có secret.
- [ ] Giữ `seller_profiles`, `seller_referral_codes`, `referral_clicks` và các cột lịch sử seller trong bước đầu. Không xóa cascade gây mất dữ liệu liên quan.
- [ ] Đối soát trước/sau: số account, đơn, tổng tiền đơn đã ghi, ledger, số dư, tồn kho, yêu cầu Chung Sức và kết nối cashback không bị thay đổi ngoài mapping đã định.
- [ ] Chỉ sau khi code không đọc/ghi nữa, consumer đã chuyển, dữ liệu được lưu trữ và đối soát xong: đề xuất migration riêng để archive/drop các cấu trúc không còn dùng.

**Rollback** là cách quay lại trạng thái dùng được nếu triển khai lỗi. Trước bước drop, giữ bản mapping để khôi phục role/rule khi cần; phục hồi session bằng đăng nhập mới. Không bật lại API seller thiếu kiểm soát chỉ để quay về code cũ. Không coi `down()` của migration drop bảng là khôi phục được dữ liệu: cần backup/restore và kế hoạch giữ các giao dịch phát sinh sau backup.

**Hoàn tất khi:** chạy thử trên bản sao dữ liệu thành công, có báo cáo đối soát và đường khôi phục; chỉ bỏ role `SELLER` khi không còn account/phụ thuộc cần nó. Xóa vật lý dữ liệu cũ là bước riêng, không điều kiện bắt buộc để shop hoạt động đúng.

## 7. Giai đoạn 4 — dọn frontend và hướng dẫn vận hành

- [ ] Giữ `/admin/inventory`, catalog, đơn, ví/giao dịch, voucher và hỗ trợ là công cụ chủ shop.
- [ ] Gỡ `SellerDashboardPage`, kiểu seller và `sellersAPI` sau khi kiểm tra không còn consumer; router hiện không mở route seller.
- [ ] Không xóa toàn bộ `services/api.ts`/types vì vẫn có phần khác sử dụng; chuyển consumer được giữ sang client chuẩn khi cần.
- [ ] Form/filter account chỉ hiển thị `USER`/`ADMIN`; kiểm tra mapper role BE viết hoa sang UI `user`/`admin`.
- [ ] Bỏ nhãn/chọn seller, mã seller, commission seller trong luồng shop. Giữ mã voucher, mã mời game và cashback referral đúng ngữ cảnh.
- [ ] Màn hình cần thể hiện rõ “Kho hàng của shop”, “Quản trị shop”, “Yêu cầu tiếp sức”; có trạng thái chờ tải, rỗng, lỗi và không đủ quyền.
- [ ] Đồng bộ hướng dẫn khởi tạo account quản trị và seed; docs mô tả đúng kết quả kiểm chứng mới, không tiếp tục dùng tài khoản demo seller làm hướng dẫn vận hành.

**Hoàn tất khi:** khách mua từ một shop rõ ràng, chủ shop nhập kho/xử lý đơn bằng admin, không có đường UI dẫn sang seller.

## 8. Giai đoạn 5 — kiểm tra và phát hành

| Nhóm | Tiêu chí cần chứng minh |
| --- | --- |
| Phân quyền | Guest/USER không nhập kho hoặc quản trị; admin hợp lệ thực hiện được; không mất admin cuối cùng |
| Role cũ | SELLER không được tạo/gán mới; account chuyển sang USER còn ví/đơn, token cũ không vượt quyền |
| Seller API | Mọi method/path cũ trả 410 trong giai đoạn chuyển tiếp, không ghi dữ liệu; sau gỡ route kiểm tra 404 |
| Tính tiền | Checkout dùng giá backend, không nhận giá/sellerCode giả; tiền dạng decimal string; idempotency không debit hai lần |
| Tồn kho | Hai request tranh một hàng chỉ một bên mua thành công; thiếu tiền/hết hàng không gây giao trùng/số dư sai |
| Quyền sở hữu | Khách A không đọc/sửa giỏ, ví, đơn, hàng được giao của B |
| Dịch vụ còn giữ | Chung Sức tạo yêu cầu/snapshot giá đúng; mã mời không bị coi là mã seller; cashback referral không bị xóa |
| Dữ liệu | Migration thử, đối soát và khôi phục đạt; không đổi giá/lịch sử đơn đã mua |
| FE | Luồng khách và admin sử dụng được trên mobile/desktop; không có request seller từ luồng đang dùng |

Lệnh kiểm tra source sau khi triển khai: BE `npm run build`, `npm run lint`, `npm test -- --runInBand`; FE `npm run lint`, `npm run build`. Chạy test mục tiêu trước; ghi rõ lỗi baseline. Kiểm thử tích hợp DB cho transaction/migration và e2e trên môi trường có BE/DB mới chứng minh được hành vi đồng thời; chỉ build xanh chưa đủ.

Thứ tự phát hành: chuẩn bị dữ liệu → ngừng API seller/chặn role mới → tháo seller khỏi giá và consumer → chuyển role/session, đối soát → kiểm thử và theo dõi → hết giai đoạn chuyển tiếp mới gỡ route → cân nhắc dọn schema riêng. Ghi mốc chuyển tiếp dựa trên kiểm kê consumer, không tự ấn định khi chưa có dữ liệu.

## 9. Điều kiện hoàn thành đợt triển khai sau này

Hoàn thành khi hệ thống hoạt động theo hai role, kho chung do admin quản lý, không còn luồng seller hoạt động, checkout và Chung Sức giữ tính đúng đắn, dữ liệu cũ được đối soát và tài liệu cập nhật bằng bằng chứng kiểm thử. Giữ bảng lịch sử không dùng vẫn chấp nhận được; không cần xóa dữ liệu để đạt nghiệp vụ mới.

**Trạng thái hiện tại:** đã làm phần tài liệu và bước tạm ngừng seller trong code theo cập nhật đầu tài liệu. Migration/chuyển dữ liệu thật, archive/drop và phát hành vẫn chưa thực hiện. Không coi toàn bộ các giai đoạn trên là hoàn tất.

Kiểm tra tài liệu: kiểm tra đường dẫn tương đối trong bộ docs mới và các tài liệu đã chỉnh; kiểm tra cú pháp ví dụ JSON và đủ các mục bắt buộc của tám đặc tả endpoint liên quan. Đợt tài liệu ban đầu không chạy build/test source; đợt triển khai tạm ngừng tiếp theo đã chạy build, lint và test tự động, kết quả ghi trong bản thay đổi. Các tiêu chí tích hợp DB/provider thật vẫn chưa được xác minh.
