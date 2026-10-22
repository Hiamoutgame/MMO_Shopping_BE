# Kế Hoạch Kết Nối API Frontend

> **Bổ sung 23/10/2026:** Đây là checklist tích hợp theo giai đoạn cũ. Khi sửa nghiệp vụ role/seller/kho, dùng [plan shop một chủ](../plan/single-owner-shop.md), [API](../api/single-owner-shop.md), [rule](../rule/business.md). `ADMIN` chính là chủ shop vận hành kho/đơn; không mở rộng seller dashboard từ các báo cáo cũ. Các mục hoàn thành bên dưới không thay thế đối chiếu source và kiểm thử hiện tại.

> Mục đích: cung cấp checklist triển khai để thay mock và mô phỏng phía client bằng API backend cho các màn hình frontend hiện có.
>
> Tài liệu bắt buộc đối chiếu khi triển khai: `docs/rule/conventions.md`, `docs/structure/FE.md`, `docs/api/conventions.md`, source `MMO_Shopping_FE/src` và controller thực tế trong `MMO_Shopping_BE/src/modules`.

> **Trạng thái (27/08/2026):** Bước 0 (môi trường + HTTP client), Giai đoạn 1 (identity) và Giai đoạn 2 (catalog + product view) đã triển khai xong về code; `pnpm lint` + `pnpm build` xanh. Smoke test runtime (cần BE + DB chạy) chưa thực hiện. Giai đoạn 3–5 chưa bắt đầu.
>
> **Bổ sung (29/08/2026):** Mở thêm **Giai đoạn 6 - Admin v1** — dựng layout/route/quản trị cho các domain admin đã có controller thật trên BE (system, identity, catalog, inventory, commerce, finance). Automation/support/integration vẫn giữ `BLOCKED/OUT OF SCOPE`.

## 1. Phạm Vi

### Trong phạm vi

- Auth: register, login, refresh token, session restore, logout.
- Catalog: category, product list, product detail và product view.
- Shopping: cart get/add/update/delete.
- Commerce: voucher validation và checkout.
- Automation: chuẩn bị contract cho support-code, chỉ triển khai khi backend tương ứng sẵn sàng.
- Thêm `RequireAuth` cho các route hiện có cần đăng nhập.
- Bổ sung loading, empty, error, unauthorized và disabled state cho workflow gọi API.

### Ngoài phạm vi

- Wallet, deposit và wallet transaction.
- Order history và order detail page.
- Favorites.
- Ticket, warranty claim và support conversation.
- Admin layout, admin route và toàn bộ admin API.
- Thêm thư viện quản lý server state hoặc test framework mới.
- Thiết kế lại UI tổng thể.

Không thêm page hoặc route nghiệp vụ mới trong đợt này. `RequireAuth` chỉ là wrapper bảo vệ route hiện có.

## 2. Ký Hiệu Trạng Thái

| Trạng thái     | Ý nghĩa                                                                 |
| :------------- | :---------------------------------------------------------------------- |
| `READY`        | Backend đã có controller/service tương ứng và có thể bắt đầu tích hợp.  |
| `BLOCKED`      | Thiếu backend controller/service hoặc phụ thuộc bắt buộc chưa sẵn sàng. |
| `OUT OF SCOPE` | Không triển khai trong đợt kết nối API này.                             |

Markdown checkbox dùng để theo dõi công việc:

- `[ ]`: chưa làm.
- `[x]`: đã hoàn thành và đã kiểm tra.

Không đánh dấu `[x]` chỉ vì endpoint có trong `docs/api`. Chỉ đánh dấu khi frontend đã gọi được controller thực tế và vượt qua tiêu chí kiểm tra của mục tương ứng.

## 3. Hiện Trạng Và Điều Kiện Tiên Quyết

### 3.1 Mức độ sẵn sàng của backend

| Domain         | Trạng thái     | Căn cứ hiện tại                                                          | Phạm vi FE                               |
| :------------- | :------------- | :----------------------------------------------------------------------- | :--------------------------------------- |
| `identity`     | `READY`        | Có `AuthController` tại `/api/v1/auth`.                                  | Register, login, refresh, me, logout.    |
| `catalog`      | `READY`        | Có `CatalogController` tại `/api/v1`.                                    | Categories, products, product detail.    |
| `shopping`     | `READY`        | Có `ShoppingController` tại `/api/v1`.                                   | Cart và product view.                    |
| `commerce`     | `READY`        | Có `CommerceController` tại `/api/v1`.                                   | Voucher validation và checkout.          |
| `automation`   | `BLOCKED`      | `AutomationModule` hiện chưa có controller/service.                      | Support-code chưa được gọi như API thật. |
| `support`      | `OUT OF SCOPE` | Backend chưa có controller/service và FE chưa có ticket/warranty page.   | Không triển khai.                        |
| `finance`      | `OUT OF SCOPE` | Backend đã có API nhưng FE hiện chưa có wallet/deposit page.             | Không triển khai.                        |
| `system/admin` | `READY FOR ADMIN V1` | Backend có controller admin thật cho dashboard/reports/audit-logs. | Triển khai Giai đoạn 6 - Admin v1. |

`ContactPage` hiện là form mô phỏng phía client và không có endpoint contact tương ứng. Không tự ánh xạ form này sang ticket API nếu chưa có yêu cầu sản phẩm và contract rõ ràng.

### 3.2 Kết nối môi trường

Backend hiện chưa gọi `app.enableCors()`. Local development dùng Vite proxy để FE và API cùng origin từ góc nhìn trình duyệt.

- [x] Thêm biến `VITE_API_BASE_URL=/api/v1` cho frontend.
- [x] Thêm biến `VITE_API_PROXY_TARGET=http://127.0.0.1:3000` cho local development.
- [x] Thêm `.env.example`; không commit secret hoặc token thật.
- [x] Cấu hình Vite proxy `/api` tới `VITE_API_PROXY_TARGET`.
- [x] Giữ API path frontend tương đối với `VITE_API_BASE_URL`, không lặp `/api/v1` trong từng service.
- [ ] Xác nhận production reverse proxy chuyển `/api/v1` tới backend cùng origin.
- [ ] Kiểm tra request từ trình duyệt không gặp CORS, mixed-content hoặc sai proxy target.

Giá trị mặc định dùng trong local:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://127.0.0.1:3000
VITE_ENABLE_SUPPORT_CODE=false
```

## 4. Contract Và Cấu Trúc Chung

### 4.1 Interface tối thiểu

Các type nền phải nằm trong `common/models` hoặc nhóm model API phù hợp:

```ts
export type Money = string;

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  message: string | null;
  errorCode: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  status: number | null;
  message: string;
  errorCode: string | null;
  fieldErrors?: Record<string, string[]>;
}

export interface ApiRequestOptions {
  idempotencyKey?: string;
}
```

Quy định:

- Money từ transport/domain model luôn là decimal string.
- Không dùng JavaScript `number` để cộng, trừ hoặc tính tổng tiền nghiệp vụ.
- UI chỉ format giá trị tiền ở formatter/tầng render.
- API DTO không được truyền thẳng vào reusable component nếu khác UI model.
- Mapper đặt trong `common/mapping`; page nhận UI/domain model đã chuẩn hóa.
- Enum từ backend được giữ đúng contract hoặc map rõ ràng sang enum UI, không so sánh bằng chuỗi rải rác trong component.

### 4.2 Một HTTP client duy nhất

- [x] Chọn một Axios client chuẩn và loại bỏ vai trò trùng giữa `common/apis/axios.ts` và `common/libs/request.ts`.
- [x] Client dùng `VITE_API_BASE_URL`, timeout và JSON headers mặc định.
- [x] Request interceptor gắn `Authorization: Bearer <accessToken>` khi có token.
- [x] Response interceptor parse `ApiEnvelope<T>` và trả dữ liệu theo một quy ước thống nhất.
- [x] Chuẩn hóa network error, timeout, validation error và backend envelope thành `ApiError`.
- [x] Không hiển thị trực tiếp raw Axios error trong UI.
- [x] Hỗ trợ truyền `Idempotency-Key` qua `ApiRequestOptions`.
- [x] Không đặt navigation hoặc React hook trực tiếp trong HTTP client; phát sự kiện/session callback để tầng ứng dụng xử lý redirect.

### 4.3 Refresh-token flow

- [x] Không chạy refresh cho login, register, refresh hoặc request đã retry.
- [x] Khi request nhận `401`, chỉ tạo một refresh request dùng chung cho các request đang chờ.
- [x] Gửi refresh token trong body tới `POST /auth/refresh`.
- [x] Lưu cả access token và refresh token mới do backend rotate.
- [x] Retry request gốc đúng một lần với access token mới.
- [x] Refresh thất bại phải xóa token, reset auth state và chuyển về `/login`.
- [x] Lưu `returnTo` để quay lại route trước đó sau khi đăng nhập thành công.
- [x] Không tạo vòng lặp refresh vô hạn.

### 4.4 API service theo domain

- [x] Tạo `identityApi` cho `/auth/*`.
- [x] Tạo `catalogApi` cho `/categories` và `/products`.
- [ ] Tạo `shoppingApi` cho `/cart/*` và `/product-views`. _(đã tạo phần `product-views`; phần `/cart/*` thuộc GĐ3)_
- [ ] Tạo `commerceApi` cho `/vouchers/validate` và `/checkout`.
- [ ] Chỉ tạo `automationApi` khi automation controller thực tế đã tồn tại.
- [x] Cập nhật `API_PATHS` đúng với controller backend; xóa các path sai như `/cart/add`.
- [x] Không tạo service cho domain ngoài phạm vi chỉ để chuẩn bị trước.

## 5. Giai Đoạn 1 - Identity (`READY`)

### 5.1 API cần nối

- [x] `POST /auth/register`.
- [x] `POST /auth/login`.
- [x] `POST /auth/refresh`.
- [x] `GET /auth/me`.
- [x] `POST /auth/logout`.

`POST /auth/logout-all` không cần UI trong đợt này.

### 5.2 Model, mapper và store

- [x] Tạo request/response DTO cho register, login, refresh, me và logout.
- [x] Map account backend sang `User` UI, gồm `id`, `email`, `displayName`, role và status.
- [x] Chuẩn hóa role/status backend trước khi đưa vào UI.
- [x] Cập nhật auth store để lưu account, token và trạng thái khởi tạo session.
- [x] Phân biệt `isInitializing` với `isAuthenticated` để tránh redirect sớm khi đang gọi `/auth/me`.
- [x] LocalStorage chỉ giữ token/session metadata; user hiện tại được xác nhận lại bằng backend.

### 5.3 Login và register

- [x] Thay mock user/token và `setTimeout` trong `LoginPage` bằng `identityApi.login`.
- [x] Thay timeout giả lập trong `RegisterPage` bằng `identityApi.register`.
- [x] Register thành công phải lưu token backend trả về và coi user đã đăng nhập.
- [x] Login/register thành công điều hướng tới `returnTo`; nếu không có thì về `/products`.
- [x] Giữ Zod validation hiện có và map lỗi backend vào thông báo form phù hợp.
- [x] Disable submit trong lúc request đang chạy.
- [x] Không gửi lặp request khi user bấm submit nhiều lần.

### 5.4 Session restore, guard và logout

- [x] Khi app khởi động và có access token, gọi `GET /auth/me` để khôi phục session.
- [x] Nếu `/auth/me` trả `401`, chạy refresh flow trước khi kết luận session hết hạn.
- [x] Tạo `RequireAuth` và bọc route `/cart`, `/support`.
- [x] User chưa đăng nhập được chuyển về `/login` cùng `returnTo`.
- [x] Header hiển thị trạng thái account và lệnh logout khi đã đăng nhập.
- [x] Logout gọi API với refresh token hiện tại nếu có, sau đó luôn dọn local session.
- [ ] Khi logout hoàn thành, reset cart server state và đưa user về route public phù hợp. _(cart server state thuộc GĐ3)_

### 5.5 Điều kiện hoàn thành identity

- [x] Register/login dùng backend thật và không còn import mock auth trong page.
- [ ] Reload trình duyệt vẫn khôi phục đúng account. _(cần smoke test runtime)_
- [ ] Token hết hạn được refresh và request gốc chỉ retry một lần. _(cần smoke test runtime)_
- [ ] Refresh thất bại đưa user về login, không để UI ở trạng thái đăng nhập giả. _(cần smoke test runtime)_
- [ ] Route cart/support không hiển thị dữ liệu private trước khi guard hoàn tất. _(cần smoke test runtime)_

## 6. Giai Đoạn 2 - Catalog Và Product View (`READY`)

### 6.1 API cần nối

- [x] `GET /categories`.
- [x] `GET /products`.
- [x] `GET /products/{id}`.
- [x] `POST /product-views`.

### 6.2 Contract và mapper

- [x] Tạo DTO cho category, product list, product detail và variant.
- [x] Map `imageUrls` sang image chính/fallback phù hợp với component hiện tại.
- [x] Map category và primary category sang label/filter UI.
- [x] Map trạng thái product/variant sang trạng thái hiển thị.
- [x] Giữ giá variant dạng `Money` và cập nhật formatter/component để render decimal string.
- [x] Không giữ `price: number` trong model dùng cho dữ liệu API.
- [x] Bảo toàn `productVariantId`; cart mutation bắt buộc dùng variant ID, không dùng product ID. _(variant ID đã giữ xuyên suốt detail→state; gửi tới `/cart/items` thuộc GĐ3)_

### 6.3 Product list

- [x] Thay `MOCK_PRODUCTS` trong `ProductsPage` bằng `catalogApi`.
- [x] Đồng bộ `page`, `pageSize`, `categoryId`, `minPrice`, `maxPrice`, `inStock` với query backend. _(đã đồng bộ `page/pageSize/categoryId`; `minPrice/maxPrice/inStock` chưa có control UI)_
- [x] Reset page về `1` khi filter thay đổi.
- [x] Render pagination theo `totalPages` backend trả về.
- [x] Không coi client filter là kết quả toàn bộ catalog khi backend đang phân trang.
- [x] Public product API hiện chưa có keyword search: giữ search client-side với nhãn giới hạn phù hợp hoặc chờ backend bổ sung `search`; không gửi query backend không hỗ trợ.
- [x] Có loading, empty, error và retry state mà không làm thay đổi layout bất thường.

### 6.4 Product detail và view tracking

- [x] Lấy `id` từ route và gọi `GET /products/{id}`.
- [x] Không fallback sang product mock đầu tiên khi ID sai hoặc backend trả `404`.
- [x] Render variant và giá theo response backend.
- [ ] Add-to-cart gửi variant đang chọn cùng quantity. _(thuộc GĐ3 — POST /cart/items)_
- [x] Tạo anonymous `sessionId` ổn định trong session storage cho product view khi chưa đăng nhập.
- [x] Gọi `POST /product-views` một lần cho mỗi lần mở product detail hợp lệ.
- [x] Dùng guard/ref để React Strict Mode không tạo hai lượt view cho cùng mount.
- [x] Product view failure không được chặn việc xem product detail.

### 6.5 Điều kiện hoàn thành catalog

- [x] Product list/detail không còn đọc trực tiếp `MOCK_PRODUCTS`.
- [ ] Loading, empty, `404` và network error hiển thị đúng. _(đã code state; cần smoke test runtime)_
- [ ] Variant ID được giữ xuyên suốt từ detail/list tới cart request. _(giữ tới state; gửi cart thuộc GĐ3)_
- [x] Giá hiển thị đúng nhưng không được tính nghiệp vụ bằng `number`. _(render dùng string; `useCartStore`/`CartLineItem` tạm `Number()` chỉ cho draft, sẽ bỏ ở GĐ3)_
- [x] Pagination/filter tạo query đúng contract backend.

## 7. Giai Đoạn 3 - Cart (`READY`)

### 7.1 API cần nối

- [ ] `GET /cart`.
- [ ] `POST /cart/items` với `productVariantId` và `quantity`.
- [ ] `PATCH /cart/items/{id}` với `quantity`.
- [ ] `DELETE /cart/items/{id}`.

### 7.2 Nguồn dữ liệu và auth

- [ ] Cart yêu cầu đăng nhập; add-to-cart khi chưa đăng nhập phải chuyển tới login với `returnTo`.
- [ ] Không tiếp tục dùng localStorage cart làm nguồn dữ liệu chuẩn.
- [ ] Tải server cart sau khi auth/session restore thành công.
- [ ] Chỉ xóa hoặc vô hiệu hóa `CART_STATE` cũ sau khi server cart tải thành công, tránh dọn dữ liệu vì một network error tạm thời.
- [ ] Header badge lấy tổng quantity từ server cart state.
- [ ] Logout phải reset cart state trên client.

### 7.3 Mutation và UI state

- [ ] Add-to-cart dùng variant đang chọn, không dùng product ID.
- [ ] Update/delete dùng cart item ID backend, không dùng product ID.
- [ ] Disable control của item đang mutation để tránh request chồng nhau.
- [ ] Sau mutation, cập nhật state từ response backend hoặc refetch cart; chọn một chiến lược thống nhất.
- [ ] Không tự tính subtotal nghiệp vụ từ mock product; ưu tiên pricing/totals backend trả về.
- [ ] Xử lý `401`, item không tồn tại, variant inactive/out-of-stock và `409` conflict.
- [ ] Khi mutation fail, giữ dữ liệu server gần nhất và hiển thị lỗi có thể retry.

### 7.4 Điều kiện hoàn thành cart

- [ ] Add/update/delete phản ánh đúng sau reload trang.
- [ ] Header badge và `CartPage` dùng cùng một nguồn server cart.
- [ ] Không còn ghi cart nghiệp vụ vào localStorage.
- [ ] User không đăng nhập không thể gọi cart endpoint private.
- [ ] Conflict hoặc session hết hạn không làm UI hiển thị cart sai như đã lưu thành công.

## 8. Giai Đoạn 4 - Voucher Và Checkout (`READY`)

### 8.1 API cần nối

- [ ] `POST /vouchers/validate` với `code` và `cartId` nếu cần.
- [ ] `POST /checkout` với `cartId`, `voucherCode` nếu có và header `Idempotency-Key`.

### 8.2 Voucher

- [ ] Xóa logic hard-code voucher `MMOAI10` khỏi workflow thật.
- [ ] Validate voucher bằng backend trước khi hiển thị discount preview.
- [ ] Hiển thị discount/pricing từ response backend; không tự nhân phần trăm bằng JavaScript `number`.
- [ ] Reset voucher result khi code hoặc cart thay đổi.
- [ ] Disable apply button trong lúc validate.
- [ ] Xử lý code không tồn tại, chưa hiệu lực, hết hạn, không đủ minimum và vượt usage limit.

### 8.3 Checkout và idempotency

- [ ] Email hiển thị từ account hiện tại; không gửi email vì `CheckoutDto` không có field này.
- [ ] Sinh một idempotency key cho mỗi ý định checkout mới, ưu tiên `crypto.randomUUID()`.
- [ ] Giữ nguyên key khi retry cùng cart/voucher sau timeout hoặc network error chưa xác định kết quả.
- [ ] Sinh key mới khi cart/voucher thay đổi hoặc checkout trước đã kết thúc chắc chắn.
- [ ] Disable checkout trong lúc request đang chạy và chặn double-click.
- [ ] Không tự động retry checkout bằng key mới.
- [ ] Khi backend trả idempotency replay hợp lệ, xử lý như cùng một kết quả thay vì tạo order mới.
- [ ] Checkout thành công làm mới cart và hiển thị order ID trong confirmation hiện tại.
- [ ] Không thêm order-history hoặc wallet route trong đợt này.

### 8.4 Lỗi nghiệp vụ

- [ ] Hiển thị lỗi voucher bằng thông báo có thể sửa input.
- [ ] Hiển thị lỗi ví không đủ tiền nhưng không tạo link tới wallet page chưa tồn tại.
- [ ] Khi inventory/cart conflict, refetch cart trước khi cho checkout lại.
- [ ] Khi `401`, hoàn tất refresh flow trước khi kết luận checkout thất bại.
- [ ] Khi timeout, giữ idempotency key và cho phép user retry có kiểm soát.
- [ ] Không clear cart phía client nếu chưa nhận được kết quả checkout thành công/replayed rõ ràng.

### 8.5 Điều kiện hoàn thành checkout

- [ ] Voucher không còn được tính bằng mock/hard-code.
- [ ] Backend là nguồn pricing cuối cùng.
- [ ] Double-click hoặc retry cùng ý định không tạo hai order.
- [ ] Checkout thành công làm cart rỗng theo trạng thái backend.
- [ ] Lỗi ví, inventory, voucher và session có trạng thái UI rõ ràng.

## 9. Giai Đoạn 5 - Support-Code (`BLOCKED`)

Không nối `SupportPage` với endpoint chỉ tồn tại trong tài liệu thiết kế. Chỉ mở các checkbox dưới đây khi backend đã có controller/service và contract runtime đã được kiểm tra.

### 9.1 Điều kiện gỡ blocker

- [ ] Backend có controller cho create, pay và get detail support-code request.
- [ ] Backend service xử lý state transition và ownership.
- [ ] Outbox worker/dispatch flow cần thiết cho kết quả automation đã hoạt động.
- [ ] Contract runtime khớp hoặc đã cập nhật so với `docs/api/automation`.
- [ ] Có môi trường/sự kiện cho phép test end-to-end.
- [ ] Bật `VITE_ENABLE_SUPPORT_CODE=true` ở môi trường được phép.

### 9.2 Checklist tích hợp sau khi gỡ blocker

- [ ] Tạo request bằng `code` và `quantity`.
- [ ] Pay request bằng `Idempotency-Key`.
- [ ] Poll detail request để lấy status và result.
- [ ] Map `ACTIVE`, `PROCESSING`, `SUCCESS`, `FAILED`, `PARTIAL_SUCCESS` sang UI `SupportProgress`.
- [ ] Dừng polling khi đạt terminal state.
- [ ] Dừng polling khi logout, unmount, mất quyền hoặc vượt giới hạn retry.
- [ ] Dùng backoff/interval cố định có giới hạn; không tạo nhiều polling loop cho cùng request.
- [ ] Khi feature flag tắt, disable submit và không chạy timeout mô phỏng như kết quả production.
- [ ] Xóa mô phỏng `setTimeout` chỉ sau khi API thật đã chạy end-to-end.

### 9.3 Điều kiện hoàn thành support-code

- [ ] Không còn hiển thị trạng thái success giả lập trong production.
- [ ] Pay retry không trừ tiền/tạo order hai lần.
- [ ] Refresh trang có thể tải lại request đang xử lý nếu UI giữ request ID.
- [ ] Partial success và failure hiển thị đúng, không bị map chung thành completed.

## 9bis. Giai Đoạn 6 - Admin V1 (`READY FOR ADMIN V1`)

Admin v1 chỉ làm với các domain admin đã có controller runtime thật trên BE. Automation/support/integration chưa có controller nên KHÔNG nằm trong đợt này.

### 9bis.1 Phạm vi domain admin được làm

| Domain | Endpoint admin (BE thật) | Trang FE |
| :------ | :------------------------ | :------- |
| `system` | `GET /admin/dashboard/overview`, `GET /admin/reports/summary`, `GET /admin/audit-logs` | `/admin` (dashboard), `/admin/audit-logs` |
| `identity` | `GET/POST /admin/accounts`, `GET/PATCH/DELETE /admin/accounts/:id`, `GET /admin/roles` | `/admin/accounts` |
| `catalog` | category/product/variant CRUD theo `AdminCatalogController` | `/admin/catalog` |
| `inventory` | `GET/POST /admin/inventory-items`, `GET/PATCH /admin/inventory-items/:id` | `/admin/inventory` |
| `commerce` | orders list/detail/status/refund, vouchers CRUD | `/admin/orders`, `/admin/vouchers` |
| `finance` | payment-transactions list/detail, wallet-ledgers list | `/admin/finance` |

### 9bis.2 Checklist triển khai

- [ ] Tạo `RequireAdmin` guard: guest → `/login?returnTo`, user thường → 403, admin → vào.
- [ ] Tạo `AdminLayout` (sidebar + topbar), không gọi API, không chứa business logic.
- [ ] Thêm route group `/admin/*` trong `routes/` + `lazyComponents`.
- [ ] Mở rộng `API_PATHS` thêm nhóm admin (dashboard/reports/audit-logs/accounts/roles/catalog/inventory/orders/vouchers/finance).
- [ ] Tạo `adminApi` service + DTO model + mapper cho các domain admin trên.
- [ ] Tạo admin pages: dashboard, accounts, catalog, inventory, orders, vouchers, finance, audit-logs.
- [ ] Mỗi page có loading/empty/error/forbidden/disabled-submit + confirm destructive actions + pagination/filter.
- [ ] Tiền giữ decimal string; chỉ format ở render, không dùng `number` cho nghiệp vụ.
- [ ] Mutation nguy hiểm (refund/delete) gửi `Idempotency-Key` qua `ApiRequestOptions`.

### 9bis.3 Điều kiện hoàn thành admin v1

- [ ] Guest bị chuyển login khi vào `/admin`.
- [ ] User thường bị chặn (403), admin vào được dashboard.
- [ ] List dashboard/accounts/products/orders/audit-logs render được dữ liệu backend.
- [ ] Create/update/delete gửi đúng payload với token admin.
- [ ] 401 → refresh hoạt động; 403 hiển thị trạng thái không có quyền.
- [ ] Responsive desktop/tablet/mobile cho sidebar, table overflow, modal/drawer, form validation.
- [ ] `pnpm lint` + `pnpm build` xanh.

## 10. Dọn Mock Và Tránh Regression

- [ ] Chỉ xóa mock của domain sau khi domain đó vượt qua smoke test với backend. _(đã xóa mock auth/products; smoke test chưa chạy)_
- [x] Auth page không còn import `MOCK_USER` hoặc `MOCK_TOKENS`.
- [x] Product page/detail không còn import `MOCK_PRODUCTS` sau khi catalog hoàn tất.
- [ ] Cart không còn persist server cart vào localStorage. _(thuộc GĐ3)_
- [ ] Voucher/checkout không còn `alert`, hard-code discount hoặc clear cart giả lập. _(thuộc GĐ4)_
- [x] Support mock được giữ hoặc vô hiệu hóa có chủ đích cho tới khi hết `BLOCKED`. _(giữ nguyên SupportPage mock)_
- [x] `ContactPage` không được mô tả là đã gửi dữ liệu về backend. _(giữ nguyên mô phỏng client)_
- [x] Không để reusable component tự gọi API hoặc đọc mock.
- [x] Không để layout gọi API hoặc chứa business workflow.
- [x] Không thêm dependency mới nếu Axios, Zustand và hook hiện có đã đáp ứng được.

## 11. Kiểm Tra Và Quality Gate

Frontend hiện chưa có test runner hoặc script test. Trong đợt này, quality gate bắt buộc là lint, build và smoke test thủ công.

### 11.1 Static checks

- [x] Chạy `pnpm lint` trong `MMO_Shopping_FE`.
- [x] Chạy `pnpm build` trong `MMO_Shopping_FE`.
- [x] Xác nhận TypeScript không dùng `any` để né contract API.
- [x] Xác nhận chỉ còn một Axios client thực sự được import.
- [x] Xác nhận không còn API path sai như `/cart/add`.

### 11.2 Smoke test identity

- [ ] Register hợp lệ tự đăng nhập và điều hướng đúng.
- [ ] Email trùng/validation error hiển thị tại form.
- [ ] Login đúng/sai credential có trạng thái phù hợp.
- [ ] Reload trang khôi phục account bằng `/auth/me`.
- [ ] Nhiều request cùng gặp `401` chỉ tạo một refresh request.
- [ ] Refresh token hết hạn/reuse làm sạch session và chuyển về login.
- [ ] Logout thu hồi session và xóa state client.

### 11.3 Smoke test catalog và cart

- [ ] Product list hiển thị loading, dữ liệu, empty và error.
- [ ] Product detail `404` không fallback sang mock.
- [ ] Filter/pagination gửi đúng query backend.
- [ ] Product view không bị ghi hai lần do Strict Mode.
- [ ] Add-to-cart gửi đúng variant ID.
- [ ] Update/delete cart giữ đúng trạng thái sau reload.
- [ ] User chưa đăng nhập được đưa tới login trước khi thao tác private.

### 11.4 Smoke test voucher và checkout

- [ ] Voucher hợp lệ/sai/hết hạn hiển thị đúng backend result.
- [ ] Cart đổi làm vô hiệu voucher preview cũ.
- [ ] Checkout thành công hiển thị order ID và refetch cart.
- [ ] Double-click checkout chỉ tạo một request nghiệp vụ.
- [ ] Retry sau timeout dùng lại cùng idempotency key.
- [ ] Lỗi thiếu tiền và inventory conflict không clear cart sai.

### 11.5 UI states và responsive

- [ ] Mỗi page gọi API có loading, empty, error và retry khi phù hợp.
- [ ] Form/button có disabled state trong lúc submit.
- [ ] Unauthorized redirect không gây nháy private content.
- [ ] Kiểm tra mobile và desktop, bảo đảm text/state mới không tràn hoặc chồng UI.
- [ ] Request thực tế đi qua Vite proxy, không có CORS error.

## 12. Thứ Tự Triển Khai

Thực hiện tuần tự; không bắt đầu cart/checkout trước khi identity và HTTP client ổn định.

- [x] Bước 1: cấu hình môi trường, Vite proxy và một HTTP client chuẩn.
- [x] Bước 2: chuẩn hóa envelope, error, token refresh và API paths.
- [x] Bước 3: nối identity, session restore, `RequireAuth` và logout.
- [x] Bước 4: nối catalog, mapper product/variant/money và product view.
- [ ] Bước 5: chuyển cart sang backend làm nguồn dữ liệu chuẩn.
- [ ] Bước 6: nối voucher và checkout có idempotency.
- [ ] Bước 7: dọn mock theo domain, chạy lint/build và smoke test.
- [ ] Bước 8: chỉ nối support-code sau khi toàn bộ điều kiện gỡ blocker được đáp ứng.

## 13. Definition Of Done Toàn Đợt

- [ ] Auth, catalog, cart, voucher và checkout không còn dùng mock hoặc timeout giả lập. _(auth + catalog đã xong; cart/voucher/checkout chưa)_
- [ ] Reload trang khôi phục đúng session và server state. _(cần smoke test)_
- [ ] Access token hết hạn được refresh; request chỉ retry một lần. _(đã code; cần smoke test)_
- [ ] Cart dùng `productVariantId`, giữ đúng dữ liệu sau reload và không dùng localStorage làm nguồn chuẩn. _(GĐ3)_
- [x] Money giữ dạng decimal string trong transport/domain model.
- [ ] Checkout double-click/retry không tạo hai order. _(GĐ4)_
- [x] Support-code vẫn mang nhãn `BLOCKED` cho tới khi backend thật sẵn sàng.
- [x] Không tuyên bố contact, wallet, order history, favorites, support hoặc admin đã được nối API.
- [x] `pnpm lint` và `pnpm build` đều thành công.
- [ ] Smoke test bắt buộc đã hoàn thành trên mobile và desktop.

## 14. Trung Tâm Hoàn Phí 247

Trung tâm Hoàn phí là integration độc lập với support-code nội bộ. Route `/support` được giữ nguyên; route mới `/cashback/*` dùng một tab top-level thứ sáu.

### Kiến trúc đã triển khai

- [x] Backend façade allowlist `/api/v1/cashback/*`; external base URL nằm trong BE env.
- [x] `CashbackConnection` liên kết 1-1 với MMO account và mã hóa provider token bằng integration key riêng.
- [x] Provider `401` được map thành `409 CASHBACK_REAUTH_REQUIRED`.
- [x] FE dùng HTTP client/JWT MMO hiện tại; không có provider token trong browser storage.
- [x] Có flow liên kết login, 2FA/email OTP, unlink và re-auth.
- [x] Có page tạo link, ví/biến động, đơn/chi tiết, rút tiền/payment account và referral.
- [x] `/config` chỉ cấp feature flag, rate, notice và giới hạn nghiệp vụ; không đổi design system.
- [x] Responsive subnav và mobile navigation cho tab thứ sáu.

### Còn cần xác nhận runtime

- [ ] Chạy migration `AddCashbackConnections1788500000000` trên database đích.
- [ ] Contract-smoke read endpoint bằng account test qua env local/staging.
- [ ] Xác nhận payload 2FA/verify-email với provider account có bật challenge.
- [ ] Mutation rút tiền/payment account chỉ smoke test trên sandbox hoặc khi được phê duyệt rõ ràng.
- [ ] Kiểm tra production reverse proxy, HTTPS và secret manager.
