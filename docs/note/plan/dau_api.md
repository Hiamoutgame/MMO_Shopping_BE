đấu api của trang web
Danh sách API & Tài liệu tích hợp

Cấu hình khởi động ứng dụng
GET
Công khai
/config

Endpoint công khai (không cần token) để App gọi một lần khi khởi động: lấy tên/logo, màu thương hiệu, tỉ lệ hoàn tiền, trạng thái sàn, cấu hình rút tiền, banner và cờ bật/tắt tính năng.

curl https://hoanphi247.vn/api/v1/openapi/config
Phản hồi mẫu:

{
"success": true,
"data": { "site": { "name": "..." }, "theme": { "color": "#ee4d2d" }, "cashback": { "shopee_rate": 5 }, "withdraw": { "min_amount": 50000 }, "features": {...} }
}

Tạo tài khoản & Đăng nhập
POST
/auth/register · /auth/login

Đăng ký tài khoản mới hoặc đăng nhập để nhận access token. Đây là các endpoint công khai (không cần token), được giới hạn tần suất chống spam/dò mật khẩu.

Tham số (JSON body):

email, password — bắt buộc.
password_confirmation, name, phone — khi đăng ký (name, phone tùy chọn).
referral_code — tùy chọn, mã giới thiệu của người tuyến trên (App tự truyền vào từ link mời). Bị bỏ qua nếu tắt tiếp thị liên kết hoặc trùng IP người giới thiệu.
device_name — tùy chọn, tên thiết bị để quản lý phiên.
curl -X POST https://hoanphi247.vn/api/v1/openapi/auth/register \
 -H "Content-Type: application/json" \
 -d '{"email":"user@gmail.com","password":"secret123",
"password_confirmation":"secret123","referral_code":"REFABC123"}'
Phản hồi mẫu:

{
"success": true,
"message": "Đăng nhập thành công!",
"data": { "token": "xxx...", "token_type": "Bearer", "user": { "id": 1, "balance": 150000 } }
}
Tài khoản bật bảo mật 2 lớp (2FA)

Nếu bật 2FA, /auth/login KHÔNG trả token ngay mà trả về challenge_token và danh sách methods (google2fa / email_otp). Gọi tiếp bước 2 để lấy token:

POST /auth/login/2fa — gửi challenge_token + google2fa_code và/hoặc email_otp_code.
POST /auth/login/2fa/resend — gửi lại mã OTP email (nếu dùng).
curl -X POST https://hoanphi247.vn/api/v1/openapi/auth/login/2fa \
 -H "Content-Type: application/json" \
 -d '{"challenge_token":"...","google2fa_code":"123456"}'
Các endpoint hỗ trợ khác:

POST /auth/verify-email — xác minh email bằng OTP (khi hệ thống bắt buộc kích hoạt), trả về token.
POST /auth/verify-email/resend — gửi lại mã kích hoạt.
POST /auth/forgot-password — gửi email đặt lại mật khẩu (body: email).
POST /auth/reset-password — đặt mật khẩu mới (body: token, email, password, password_confirmation).
POST /auth/logout — đăng xuất, thu hồi token của phiên hiện tại (cần gửi kèm Authorization: Bearer).
Lưu ý: nếu bật "bắt buộc xác minh email", API đăng ký sẽ trả email_verification_required = true thay vì token — App cần gọi tiếp /auth/verify-email.

Lấy link hoàn tiền
POST
/cashback/link

Nhận link sản phẩm Shopee/TikTok Shop/Lazada và trả về link affiliate rút gọn kèm thông tin hoàn tiền. Yêu cầu xác thực token và bị giới hạn tần suất tạo link.

Header & Tham số:

Authorization: Bearer <token> — bắt buộc.
url — link sản phẩm Shopee, TikTok Shop hoặc Lazada (bắt buộc).
curl -X POST https://hoanphi247.vn/api/v1/openapi/cashback/link \
 -H "Authorization: Bearer <token>" \
 -H "Content-Type: application/json" \
 -d '{"url":"https://shopee.vn/product/123/456"}'
Phản hồi mẫu:

{
"success": true,
"data": { "trans_id": "...", "affiliate_url": "https://.../abcd1234", "cashback_amount": 12000 }
}

Thông tin tài khoản & Số dư
GET
/account

Lấy hồ sơ thành viên, số dư ví và các thống kê tổng hợp (số đơn, số người giới thiệu). Yêu cầu xác thực token.

Header: Authorization: Bearer <token>

curl https://hoanphi247.vn/api/v1/openapi/account \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "id": 1, "email": "...", "wallet": { "balance": 150000, "currency": "VND" }, "stats": { "orders_approved": 5, "orders_recalled": 1 } }
}
Quản lý tài khoản (cần token):

POST /account/profile — cập nhật họ tên, số điện thoại.
POST /account/password — đổi mật khẩu (current_password, password, password_confirmation); thu hồi token thiết bị khác.
POST /account/delete — tự xóa tài khoản (yêu cầu bắt buộc của App Store/Google Play). Cần bật "Cho phép tự xóa tài khoản" (hệ thống tự lưu vết số dư còn lại vào nhật ký hoạt động).

Rút tiền
POST
GET
/withdrawals

Tạo yêu cầu rút tiền, xem lịch sử rút và gửi mã OTP (nếu hệ thống bật). Mọi thao tác trừ số dư đều chạy trong giao dịch khóa dòng chống double-spending.

Các endpoint:

GET /withdrawals — lịch sử rút tiền (phân trang).
POST /withdrawals — tạo lệnh rút mới.
POST /withdrawals/otp — gửi mã OTP về email khi cần.
Tham số tạo lệnh (JSON body):

amount, payment_method (bank/wallet/momo), account_number, account_name — bắt buộc.
bank_name / wallet_name, otp_code — theo phương thức & cấu hình OTP.
curl -X POST https://hoanphi247.vn/api/v1/openapi/withdrawals \
 -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
 -d '{"amount":50000,"payment_method":"bank","bank_name":"Techcombank","account_number":"190123","account_name":"NGUYEN VAN A"}'
Phản hồi mẫu:

{
"success": true,
"message": "Tạo yêu cầu rút tiền thành công! Vui lòng chờ admin xét duyệt.",
"data": { "id": 12, "code": "WD8F3A21C", "amount": 50000, "fee": 0, "real_amount": 50000, "status": "pending" }
}

Sổ tài khoản nhận tiền
GET
POST
DELETE
/payment-accounts

Quản lý sổ tài khoản nhận tiền (ngân hàng, ví điện tử) của thành viên. Lưu trước thông tin tài khoản để điền nhanh khi rút tiền. Yêu cầu xác thực token.

Các endpoint:

GET /payment-accounts — danh sách tài khoản đã lưu (sắp xếp mặc định lên trước).
POST /payment-accounts — lưu tài khoản mới.
POST /payment-accounts/{id}/default — đặt tài khoản làm mặc định.
DELETE /payment-accounts/{id} — xoá tài khoản khỏi sổ.
Tham số tạo mới (JSON body):

payment_method — bank hoặc wallet (bắt buộc).
bank_name — tên ngân hàng hoặc ví điện tử (phải nằm trong danh sách hỗ trợ, bắt buộc).
account_number — số tài khoản hoặc số điện thoại ví (bắt buộc).
account_name — tên chủ tài khoản (bắt buộc, hệ thống tự chuyển HOA).
is_default — true/false, đặt làm mặc định (tùy chọn, mặc định false). Tài khoản đầu tiên luôn tự mặc định.
curl -X POST https://hoanphi247.vn/api/v1/openapi/payment-accounts \
 -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
 -d '{"payment_method":"bank","bank_name":"Techcombank","account_number":"190123456","account_name":"NGUYEN VAN A"}'
Phản hồi mẫu (tạo mới):

{
"success": true,
"message": "Đã lưu tài khoản nhận tiền vào sổ.",
"data": { "id": 1, "payment_method": "bank", "bank_name": "Techcombank", "account_number": "190123456", "account_name": "NGUYEN VAN A", "is_default": true }
}
Phản hồi mẫu (danh sách):

{
"success": true,
"data": { "items": [ { "id": 1, "payment_method": "bank", "bank_name": "Techcombank", "account_number": "190123456", "account_name": "NGUYEN VAN A", "is_default": true } ], "total": 1 }
}
Lưu ý

Mỗi thành viên lưu được tối đa 10 tài khoản.
Không cho phép trùng lặp (cùng hình thức + ngân hàng + số tài khoản).
Khi xoá tài khoản mặc định, hệ thống tự gán mặc định cho tài khoản mới nhất còn lại.
API này phụ thuộc vào cài đặt "Cho phép lưu tài khoản nhận tiền" trong tab Rút tiền.

Danh sách đơn hàng
GET
/orders

Lấy danh sách đơn hàng hoàn tiền của thành viên, hỗ trợ lọc theo trạng thái, nền tảng, tìm kiếm và phân trang. Yêu cầu xác thực token.

Các endpoint:

GET /orders — danh sách đơn (lọc & phân trang).
GET /orders/{id} — chi tiết một đơn hàng (kèm giá gốc, hoa hồng, tỉ lệ hoàn, lý do từ chối nếu có).
Tham số truy vấn (query):

status — pending / approved / rejected / recalled (đơn đã hoàn tiền nhưng bị sàn hủy nên đã thu hồi lại).
platform — shopee / tiktok.
search, page, per_page (tối đa 50).
curl "https://hoanphi247.vn/api/v1/openapi/orders?status=approved&per_page=20" \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "items": [ { "order_id": "...", "product_name": "...", "cashback_amount": 12000, "status": "approved" } ], "pagination": { "total": 42 } }
}

Thông báo
GET
POST
/notifications

Hộp thư thông báo trong ứng dụng: danh sách, đếm số chưa đọc (badge) và đánh dấu đã đọc. Yêu cầu xác thực token.

Các endpoint:

GET /notifications — danh sách (lọc type, filter=unread, phân trang).
GET /notifications/unread-count — số thông báo chưa đọc cho badge.
POST /notifications/{id}/read — đánh dấu 1 thông báo đã đọc.
POST /notifications/read-all — đánh dấu tất cả đã đọc.
curl "https://hoanphi247.vn/api/v1/openapi/notifications?filter=unread" \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "items": [ { "id": 1, "title": "...", "content": "...", "type": "personal", "is_read": false, "created_at": "2026-07-10T09:12:00+07:00" } ], "unread_total": 3, "pagination": {...} }
}

Nhiệm vụ nhận thưởng
GET
POST
/tasks

Danh sách nhiệm vụ đang hoạt động kèm tiến độ của thành viên, đồng bộ tiến độ và nhận thưởng khi hoàn thành. Yêu cầu xác thực token. Chỉ hoạt động khi tính năng Nhiệm vụ được bật.

Các endpoint:

GET /tasks — danh sách nhiệm vụ kèm tiến độ & thống kê (đã nhận, hoàn thành, đang làm, tổng thưởng).
GET /tasks/{id}/sync — đồng bộ lại tiến độ nhiệm vụ theo dữ liệu thực tế.
POST /tasks/{id}/claim — nhận thưởng khi nhiệm vụ đã hoàn thành (cộng tiền vào ví).
POST /tasks/{id}/submit — gửi yêu cầu xác nhận đã hoàn thành nhiệm vụ thủ công, kèm tham số note (tối đa 500 ký tự), chờ Admin duyệt.
curl https://hoanphi247.vn/api/v1/openapi/tasks \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "items": [ { "id": 1, "title": "...", "target_count": 3, "reward_amount": 10000, "progress": 2, "percent": 66, "status": "in_progress" } ], "stats": { "claimed": 4, "completed": 1, "in_progress": 2, "total_earned": 40000 } }
}
Nhận thưởng:

curl -X POST https://hoanphi247.vn/api/v1/openapi/tasks/1/claim \
 -H "Authorization: Bearer <token>"
Gửi yêu cầu xác nhận nhiệm vụ thủ công:

curl -X POST https://hoanphi247.vn/api/v1/openapi/tasks/1/submit \
 -H "Authorization: Bearer <token>" \
 -d "note=Link bài đăng: https://..."

Điểm danh hàng ngày
GET
POST
/checkin

Lấy trạng thái điểm danh (chuỗi streak, mốc thưởng, lịch sử, điều kiện) và thực hiện điểm danh nhận thưởng vào ví. Yêu cầu xác thực token. Chỉ hoạt động khi tính năng Điểm danh được bật.

GET /checkin — trạng thái: đã điểm danh hôm nay chưa, streak, có thể điểm danh không (kèm lý do), mốc thưởng và lịch sử.
POST /checkin — thực hiện điểm danh; cộng thưởng vào ví trong giao dịch khóa dòng chống điểm danh trùng.
curl -X POST https://hoanphi247.vn/api/v1/openapi/checkin \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "coins_earned": 500, "streak_days": 3, "is_bonus": false, "new_balance": 150500 }
}

Giới thiệu F1/F2 (Tiếp thị liên kết)
GET
/referrals

Lấy mã & link giới thiệu, thống kê hoa hồng, danh sách thành viên tuyến dưới F1/F2 và lịch sử hoa hồng (phân trang). Email thành viên cấp dưới được che một phần để bảo vệ quyền riêng tư. Yêu cầu xác thực token.

Tham số truy vấn (query):

level — 1 (F1) / 2 (F2), status — pending / approved (lọc lịch sử hoa hồng).
page, per_page (tối đa 50).
curl https://hoanphi247.vn/api/v1/openapi/referrals \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "referral_code": "REFABC123", "referral_link": "...", "stats": { "f1_count": 5, "f2_count": 12, "total_commission": 250000 }, "f1_members": [...], "commissions": { "items": [...] } }
}

Biến động số dư
GET
/balance-logs

Lịch sử mọi giao dịch cộng/trừ số dư ví (điểm danh, đổi quà, giftcode, rút tiền, hoa hồng...). Hỗ trợ lọc theo loại giao dịch, tìm kiếm và phân trang. Yêu cầu xác thực token.

type — lọc theo loại giao dịch (checkin, gift_exchange, withdraw_request...).
search, page, per_page (tối đa 50).
curl "https://hoanphi247.vn/api/v1/openapi/balance-logs?per_page=20" \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "items": [ { "type": "checkin", "amount_change": 500, "amount_after": 150500, "is_credit": true, "description": "..." } ], "pagination": {...} }
}

Đổi quà tặng
GET
POST
/gifts

Danh sách quà tặng, lịch sử đổi quà và thực hiện quy đổi (trừ ví trong giao dịch khóa dòng chống vượt kho/âm ví). Yêu cầu xác thực token. Chỉ hoạt động khi tính năng Đổi quà được bật.

GET /gifts — danh sách quà (lọc search, tag, type, sort, phân trang).
GET /gifts/redemptions — lịch sử đổi quà của thành viên.
POST /gifts/redeem — đổi quà (body: gift_id, fullname, phone, email, address, notes).
curl -X POST https://hoanphi247.vn/api/v1/openapi/gifts/redeem \
 -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
 -d '{"gift_id":1,"fullname":"NGUYEN VAN A","phone":"09xx","email":"a@gmail.com","address":"..."}'
Phản hồi mẫu:

{
"success": true,
"message": "Gửi yêu cầu đổi quà thành công! Vui lòng chờ admin duyệt và gửi dữ liệu.",
"data": { "code": "GFT8A2BC1D9", "amount": 20000, "status": "pending" }
}

Nhập Giftcode
POST
/giftcode/redeem

Nhập mã Giftcode để nhận thưởng vào ví khả dụng (kiểm tra hiệu lực, điều kiện & giới hạn lượt trong giao dịch khóa dòng). Yêu cầu xác thực token. Chỉ hoạt động khi tính năng Giftcode được bật.

Tham số (JSON body): code

curl -X POST https://hoanphi247.vn/api/v1/openapi/giftcode/redeem \
 -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
 -d '{"code":"WELCOME2025"}'
Phản hồi mẫu:

{ "success": true, "message": "...", "data": { "amount": 20000 } }

Sản phẩm đã lưu
GET
POST
DELETE
/saved-products

Quản lý danh sách sản phẩm lưu để mua sau: xem danh sách, thêm và xóa. Yêu cầu xác thực token.

GET /saved-products — danh sách (phân trang).
POST /saved-products — lưu sản phẩm (body: name, price, cashback_amount, affiliate_url, product_url, image, platform).
DELETE /saved-products/{id} — xóa sản phẩm khỏi danh sách.
curl https://hoanphi247.vn/api/v1/openapi/saved-products \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "items": [ { "id": 1, "platform": "shopee", "name": "...", "image": "...", "price": 199000, "cashback_amount": 12000, "affiliate_url": "...", "product_url": "..." } ], "pagination": {...} }
}

Mã giảm giá
GET
/coupons

Danh sách mã giảm giá Shopee đang còn hiệu lực, hỗ trợ lọc theo danh mục, tìm kiếm và phân trang. Yêu cầu xác thực token. Chỉ hoạt động khi tính năng Mã giảm giá được bật.

category, search, page, per_page (tối đa 50).
curl "https://hoanphi247.vn/api/v1/openapi/coupons?per_page=20" \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "items": [ { "id": 1, "platform": "shopee", "code": "FREESHIP", "title": "...", "category": "...", "min_spend": 0, "discount_amount": 15000, "discount_percentage": 0, "redirect_link": "...", "expired_at": "..." } ], "categories": [...], "pagination": {...} }
}

Bảng xếp hạng
GET
/ranking

Bảng xếp hạng thành viên: top đơn hàng, top tiền hoàn, top điểm danh, top giới thiệu và top số dư (tùy cấu hình admin bật/tắt từng bảng). Tên hiển thị được che một phần để bảo vệ quyền riêng tư. Yêu cầu xác thực token.

curl https://hoanphi247.vn/api/v1/openapi/ranking \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "top_orders": [ { "name": "N***A", "value": 42 } ], "top_cashback": [...], "top_checkin": [...] }
}

Nhật ký hoạt động
GET
/logs

Lịch sử hoạt động bảo mật của tài khoản (đăng nhập, đổi mật khẩu, điểm danh, đổi quà...). Hỗ trợ tìm kiếm và phân trang. Yêu cầu xác thực token.

search, page, per_page (tối đa 50).
curl "https://hoanphi247.vn/api/v1/openapi/logs?per_page=20" \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "items": [ { "id": 1, "activity": "Đăng nhập thành công", "ip_address": "113.161.xx.xx", "user_agent": "...", "created_at": "2026-07-10T09:12:00+07:00" } ], "pagination": {...} }
}

Trang tĩnh (Điều khoản, Chính sách)
GET
Công khai
/pages

Nội dung các trang tĩnh đã xuất bản (Điều khoản sử dụng, Chính sách bảo mật, Giới thiệu...). Endpoint công khai — cần thiết để hiển thị chính sách bảo mật trong App khi duyệt App Store / Google Play.

GET /pages — danh sách trang (slug, tiêu đề).
GET /pages/{slug} — nội dung chi tiết một trang.
curl https://hoanphi247.vn/api/v1/openapi/pages/chinh-sach-bao-mat
Phản hồi mẫu:

{
"success": true,
"data": { "slug": "chinh-sach-bao-mat", "title": "Chính sách bảo mật", "content": "<p>...</p>", "meta_description": "...", "updated_at": "2026-07-10T09:12:00+07:00" }
}

Thông báo đẩy (Push Notification)
GET
POST
/devices

Đăng ký token thiết bị (FCM/APNs) để nhận thông báo đẩy. App gọi register sau khi đăng nhập và unregister khi đăng xuất. Mỗi khi có thông báo mới trong hệ thống, server tự động gửi push tới các thiết bị đã đăng ký (cần dán Firebase Service Account ở khối Cấu hình App Mobile phía trên).

GET /devices — danh sách thiết bị đang đăng ký.
POST /devices/register — lưu token (body: token, platform, device_name).
POST /devices/unregister — hủy token (body: token).
curl -X POST https://hoanphi247.vn/api/v1/openapi/devices/register \
 -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
 -d '{"token":"<fcm_token>","platform":"android","device_name":"Samsung S23"}'
Phản hồi mẫu:

{
"success": true,
"message": "Đăng ký nhận thông báo đẩy thành công.",
"data": { "id": 5 }
}

Quản lý bảo mật (2FA & Email OTP)
GET
POST
/security

Cho phép thành viên tự bật/tắt bảo mật 2 lớp trong App: Google Authenticator (2FA) và mã OTP qua Email. Yêu cầu xác thực token.

GET /security — trạng thái các lớp bảo mật.
POST /security/2fa/setup — sinh secret + QR để quét.
POST /security/2fa/enable — body: secret, otp_code.
POST /security/2fa/disable — body: password, otp_code.
POST /security/email-otp/send · /enable · /disable
curl -X POST https://hoanphi247.vn/api/v1/openapi/security/2fa/setup \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "secret_key": "JBSWY3DPEHPK3PXP", "otpauth_url": "otpauth://totp/HoanTienShopee:...", "qr_code_url": "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=..." }
}

Quản lý phiên đăng nhập
GET
POST
/sessions

Xem danh sách thiết bị đang đăng nhập (mỗi token là một phiên) và thu hồi từ xa. Yêu cầu xác thực token.

GET /sessions — danh sách phiên, đánh dấu phiên hiện tại.
POST /sessions/{id}/revoke — thu hồi một phiên (không cho thu hồi phiên hiện tại).
POST /sessions/revoke-others — đăng xuất tất cả thiết bị khác.
curl https://hoanphi247.vn/api/v1/openapi/sessions \
 -H "Authorization: Bearer <token>"
Phản hồi mẫu:

{
"success": true,
"data": { "items": [ { "id": 1, "device_name": "Samsung S23", "last_ip": "113.161.xx.xx", "last_used_at": "2026-07-10T09:12:00+07:00", "created_at": "...", "expires_at": null, "is_current": true } ] }
}

## Trạng thái tích hợp MMO Shopping (04/09/2026)

Phần nghiệp vụ hoàn phí đã được tích hợp qua backend façade `/api/v1/cashback`; frontend không gọi trực tiếp host hoặc giữ Bearer token của Hoàn Phí 247.

Phạm vi đã nối:

- `/config`, `/cashback/link`, `/account`.
- `/orders` và `/orders/{id}`.
- `/withdrawals`, `/withdrawals/otp`.
- `/payment-accounts` và thao tác mặc định/xóa.
- `/referrals`, `/balance-logs`.
- Login, 2FA và verify-email chỉ dùng cho flow liên kết tài khoản provider.

Ngoài phạm vi hiện tại: notification, task, check-in, gift, giftcode, saved product, coupon, ranking, activity log, static page, push device và màn hình quản lý security/session.

### Cấu hình và tài khoản kiểm thử

- URL provider đặt ở backend env `HOANPHI_API_BASE_URL`; không dùng biến `VITE_API_HOANTIEN_URL`.
- Dùng `HOANPHI_TEST_EMAIL` và `HOANPHI_TEST_PASSWORD` trong env local/staging nếu chạy contract test.
- Tài khoản admin test đã được chủ dự án cung cấp ngoài source. Không ghi giá trị thật vào tài liệu hoặc Git; nên đổi mật khẩu sau đợt kiểm thử.
- Không tự động smoke test mutation rút tiền trên production. Dùng provider mock hoặc sandbox riêng.
