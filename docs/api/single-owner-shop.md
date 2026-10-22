# API cho shop một chủ

Ngày: **23/10/2026**. Đây là bản đối chiếu source và hợp đồng đích theo [nghiệp vụ](../business/single-owner-shop.md). API là đường frontend gọi backend; tên đường dẫn phân biệt công việc/quyền, không quyết định có bao nhiêu người bán.

> **Cập nhật sau rà soát:** Code đã tạm ngừng seller: namespace seller trả `410 FEATURE_RETIRED`, chỉ gán/list role USER/ADMIN; login/refresh/guard xử lý role cũ như USER; báo giá lấy account từ phiên và từ chối sellerCode. Seed và Price Engine đã tháo phần seller. Xem [bản ghi triển khai](../changes/seller-role-disabled-2026-10-23.md). Bảng hiện trạng ban đầu bên dưới là bản ghi trước thay đổi, không còn là mô tả toàn bộ code hiện tại.

## 1. Nhóm API đích

Base URL `/api/v1`: [main.ts](../../MMO_Shopping_BE/src/main.ts), `bootstrap`, đặt prefix `api`; controller dùng `v1/...`.

| Nhóm | Ví dụ endpoint | Quyền đích | Ý nghĩa |
| --- | --- | --- | --- |
| Công khai | `GET /products`, `GET /categories`, `GET /campaigns` | Không cần đăng nhập | Xem hàng/dịch vụ của shop |
| Phiên đăng nhập | `POST /auth/register`, `/auth/login`, `/auth/refresh` | Theo từng hợp đồng auth | Đăng ký chỉ tạo `USER`; không chọn seller |
| Cá nhân | `/cart`, `/checkout`, `/orders`, `/wallet` | Account đăng nhập, dữ liệu của chính mình | Khách mua hàng; admin thử mua cũng dùng dữ liệu của mình |
| Quản trị shop | `/admin/products`, `/admin/inventory-items`, `/admin/orders`, `/admin/accounts` | `ADMIN` | Chủ shop vận hành hàng, kho, đơn, khách |
| Campaign hiện tại | `POST /campaigns`, `PATCH /campaigns/:id` | `ADMIN` | Hiện chưa có prefix `/admin` nhưng có kiểm tra quyền |
| Chung Sức cá nhân | `POST /campaigns/:id/join`, `GET /campaigns/requests/me` | Account đăng nhập, đúng chủ sở hữu | Gửi/xem yêu cầu tiếp sức, không phải đăng ký seller |
| Tích hợp | `/cashback/*`, callback thanh toán/tool | Theo từng hợp đồng | Tích hợp riêng; không sinh seller nội bộ |

Các hàng trên là nhóm ví dụ, không phải danh sách đầy đủ. Xem [mục lục API](README) cho các đặc tả cốt lõi. Campaign được đối chiếu tại [ChungSucController](../../MMO_Shopping_BE/src/modules/chung-suc/controllers/chung-suc.controller.ts); không đổi URL campaign chỉ để chuẩn hóa hình thức trong đợt bỏ seller.

## 2. Hiện trạng khi rà soát ban đầu, trước bước tạm ngừng

| Quan sát từ source | Bằng chứng | Hướng xử lý trong plan |
| --- | --- | --- |
| Backend vẫn nạp `SellersModule`, `PricingModule`, `SeedModule` | [AppModule](../../MMO_Shopping_BE/src/app.module.ts), `imports` | Ngừng API seller trước, tháo phụ thuộc sau |
| Controller seller không có `UseGuards`/`Roles`; bootstrap/AppModule đã kiểm tra không đăng ký global guard | [SellersController](../../MMO_Shopping_BE/src/modules/sellers/controllers/sellers.controller.ts), [main.ts](../../MMO_Shopping_BE/src/main.ts), [AppModule](../../MMO_Shopping_BE/src/app.module.ts) | Ưu tiên chặn API seller khi triển khai; chưa kết luận khả năng truy cập từ internet hay cấu hình proxy |
| Seller trả entity/array trực tiếp | `SellersController`, kiểu trả về các hàm | Không coi là envelope chuẩn hoặc tiếp tục nối FE |
| Seed tạo role/account seller và giá `SELLER` | [seed-roles.js](../../MMO_Shopping_BE/scripts/seed-roles.js), [ChungSucSeedService](../../MMO_Shopping_BE/src/database/seeds/chung-suc-seed.service.ts), `seed` | Sửa seed trước khi khởi tạo dữ liệu mới |
| Admin tạo/sửa account có thể tự tạo role từ chuỗi `roleCode` | [AccountService](../../MMO_Shopping_BE/src/modules/identity/services/account.service.ts), `create`, `update`; [CreateAccountDto](../../MMO_Shopping_BE/src/modules/identity/dto/create-account.dto.ts) | Hợp đồng đích chỉ nhận `USER`/`ADMIN`, code chưa enforce |
| Price Engine tính theo product/base price, account role, mã seller tùy chọn; route calculate nhận `accountId` từ body | [PricingController](../../MMO_Shopping_BE/src/modules/pricing/controllers/pricing.controller.ts), `calculatePrice`; [PriceEngineService](../../MMO_Shopping_BE/src/modules/pricing/services/price-engine.service.ts), `calculatePrice` | Bỏ nhánh seller; nếu giữ API báo giá thì xác thực và lấy account từ token |
| Checkout dùng giá variant, chưa dùng Price Engine | [CommerceService](../../MMO_Shopping_BE/src/modules/commerce/services/commerce.service.ts), `checkout`, `calculateSubtotal` | Không giả định bỏ seller sẽ tự hợp nhất hai hệ thống giá |
| Chung Sức vẫn cần Price Engine | [ChungSucService](../../MMO_Shopping_BE/src/modules/chung-suc/services/chung-suc.service.ts), `joinCampaign` | Giữ báo giá và snapshot Chung Sức khi tháo seller |
| FE cũ `services/api.ts` gọi `/sellers/profile/...`, khác backend `/v1/sellers/profiles/...`; trang seller còn gọi các hàm service không có | [services/api.ts](../../MMO_Shopping_FE/src/services/api.ts), `sellersAPI`; [SellerDashboardPage](../../MMO_Shopping_FE/src/pages/seller/SellerDashboardPage.tsx) | Dọn phần seller không được router dùng, không sửa nó thành luồng mới |
| FE có cả client cũ và client trong `common/apis` | [services/api.ts](../../MMO_Shopping_FE/src/services/api.ts), [httpClient.ts](../../MMO_Shopping_FE/src/common/apis/httpClient.ts) | Rà consumer trước khi dọn; dùng client chuẩn cho luồng duy trì |

Đây là phân tích tĩnh trên source, chưa kiểm thử runtime và chưa đọc DB đang chạy.

## 3. Danh sách API seller cần ngừng

Các route dưới đây được ghi nhận khi rà soát controller cũ. [SellersController](../../MMO_Shopping_BE/src/modules/sellers/controllers/sellers.controller.ts) hiện dùng một handler chung cho toàn bộ namespace để trả 410. Prefix đầy đủ: `/api/v1/sellers`.

| Method | Đường dẫn sau prefix | Quyết định đích |
| --- | --- | --- |
| `POST`, `GET` | `/profiles` | Bỏ tạo/liệt kê hồ sơ seller |
| `GET` | `/profiles/by-account/:accountId` | Bỏ tra hồ sơ seller theo account |
| `GET`, `PATCH`, `DELETE` | `/profiles/:id` | Bỏ quản lý hồ sơ seller |
| `POST` | `/profiles/:id/approve`, `/reject`, `/suspend` | Bỏ duyệt/từ chối/đình chỉ seller; ba suffix đều nối sau `/profiles/:id` |
| `POST`, `GET` | `/profiles/:id/referral-codes` | Bỏ sinh/xem mã seller |
| `GET` | `/profiles/:id/stats` | Bỏ thống kê seller |
| `POST` | `/referral-clicks` | Bỏ ghi lượt click seller |
| `GET` | `/referral-codes/:codeId/clicks` | Bỏ lịch sử click seller |
| `POST` | `/referral-codes/:codeId/deactivate`, `/activate` | Bỏ bật/tắt mã seller; hai suffix cùng prefix code |

Không chuyển các route này sang `/admin/sellers`: như vậy vẫn giữ nghiệp vụ seller không cần thiết.

**Hợp đồng ngừng dùng đã triển khai trong code:** toàn bộ namespace seller trả `410 Gone` cùng envelope `errorCode: FEATURE_RETIRED`, không gọi service/repository seller, không có nhánh bỏ qua bằng role admin. Sau khi đối chiếu consumer và hết thời gian chuyển tiếp đã ghi nhận, có thể gỡ route riêng; lúc đó `404` mới là hành vi dự kiến. Hiện giữ namespace trả 410 để tạm ngừng có thể xem xét lại sau.

```json
{
  "success": false,
  "data": null,
  "message": "Chức năng seller đang tạm ngừng sử dụng.",
  "errorCode": "FEATURE_RETIRED"
}
```

## 4. Hợp đồng phải làm rõ

### Role và quyền

- Đăng ký công khai không nhận `roleCode`; account mới là `USER`.
- Admin tạo/cập nhật account chỉ nhận role `USER` hoặc `ADMIN`. Chuỗi khác, kể cả `SELLER`, trả `400 VALIDATION_ERROR`; không tự thêm role mới vào DB.
- `GET /admin/roles` theo thiết kế đích chỉ trả hai role được hỗ trợ. Dữ liệu seller cũ phải có lộ trình chuyển trước khi gỡ role; không chỉ ẩn khỏi dropdown.
- `401`: chưa có phiên hợp lệ; `403`: đã đăng nhập nhưng không có quyền; đọc dữ liệu cá nhân phải kiểm tra chủ sở hữu. FE ẩn nút không thay thế kiểm tra backend.
- Không tự đổi account seller thành admin. Không cho xóa/khóa/hạ quyền account admin hoạt động cuối cùng trong thiết kế đích; cần kiểm tra đồng thời khi triển khai.

### Kho của shop

`POST /api/v1/admin/inventory-items` hiện nhận **một item mỗi request**:

```json
{
  "productVariantId": "8f8f7a6e-62c7-4c2f-95bc-33d8312e7a7a",
  "payload": { "activationCode": "EXAMPLE-ONLY" },
  "metadata": { "batch": "example-batch" }
}
```

Đây là ví dụ giả định. `payload` là object chứa hàng số; backend mã hóa, không yêu cầu frontend tự sinh `encryptedPayload`. Thành công trả `data.inventoryItem` với metadata/trạng thái, không trả payload. List filter dùng `productVariantId?`, `status?`, `page`, `pageSize`. Nguồn: [CreateInventoryItemDto](../../MMO_Shopping_BE/src/modules/inventory/dto/create-inventory-item.dto.ts), [QueryInventoryItemsDto](../../MMO_Shopping_BE/src/modules/inventory/dto/query-inventory-items.dto.ts), [InventoryService](../../MMO_Shopping_BE/src/modules/inventory/services/inventory.service.ts), `create`, `findAll`, `toAdminResponse`.

Không thêm `sellerId`/`shopId` hoặc bộ lọc “kho seller”. Nếu cần nhập nhiều item một lần, đó là thay đổi API riêng, chưa phải khả năng hiện tại.

### Checkout, giá và tiền

- Giữ `POST /checkout` với `cartId?`, `voucherCode?`, `Idempotency-Key`. Account lấy từ token; backend tính tiền từ dữ liệu thật. Không nhận giá cuối hoặc `sellerId`/`sellerCode` từ client.
- Giá bán hàng số tiếp tục từ variant; bỏ seller khỏi Price Engine cần giữ giá Chung Sức và các ưu đãi không liên quan, có kiểm thử trước/sau.
- Quyền admin dùng để vận hành, không phải hạng khách hàng giảm giá. Nếu admin thử mua, áp chính sách khách hàng `USER` trong luồng tính giá đích.
- Ledger ví khách là sổ cộng/trừ tiền, không phải cơ chế chia doanh thu/chi trả seller. Không thêm bước thanh toán hoa hồng trong checkout.
- Idempotency là chống tạo kết quả/trừ tiền hai lần khi gửi lại request. Giữ quy tắc tiền, tồn kho, hoàn tiền và bảo hành trong đặc tả hiện có.

### Tích hợp khác

Giữ cashback, mã mời game, voucher và công cụ bên ngoài theo nghiệp vụ riêng. Không xóa `/cashback/referrals` chỉ vì ngừng seller. Các callback vẫn phải tuân thủ đặc tả chữ ký/xác thực tương ứng; docs này không xác nhận mọi callback đã được triển khai đủ.

## 5. Kiểm tra hợp đồng khi triển khai

1. Guest/`USER` không được nhập kho; `ADMIN` thực hiện được; payload không lộ ở list/detail/audit.
2. Mọi route seller trong giai đoạn chuyển tiếp trả `410`, không tạo hồ sơ/mã/click với bất kỳ role nào.
3. `roleCode: SELLER` và chuỗi tùy ý bị từ chối ở tạo/sửa account; đăng ký công khai không nâng quyền.
4. Khách A không đọc đơn/ví/giỏ của B; cùng `Idempotency-Key` không mua hai lần.
5. Hai khách tranh một hàng không được giao trùng; thiếu tiền/hết hàng không để lại debit/đơn dở dang.
6. Chung Sức vẫn chụp đúng giá yêu cầu; cashback referrals vẫn dùng đúng connection của account.

Đây là bộ tiêu chí tổng thể; các mục đã kiểm tra trong đợt tạm ngừng được ghi ở [bản thay đổi](../changes/seller-role-disabled-2026-10-23.md), không đồng nghĩa mọi tiêu chí DB/provider thật đã đạt. Xem [plan](../plan/single-owner-shop.md) để biết phụ thuộc và thứ tự thực hiện.
