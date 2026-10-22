# Quy tắc nghiệp vụ shop một chủ

Ngày: **23/10/2026**. Áp dụng làm chuẩn thiết kế khi sửa BE, FE, schema, API và docs. Các quy tắc đích dưới đây chưa đồng nghĩa source đã thực thi đầy đủ; khác biệt và việc cần sửa có trong [API](../api/single-owner-shop.md) và [plan](../plan/single-owner-shop.md).

> **Bước tạm ngừng đã triển khai:** Gán role mới chỉ USER/ADMIN; API seller trả 410; tài khoản có role seller cũ dùng quyền USER mà không tự sửa DB. Giữ dữ liệu/quan hệ seller để xử lý sau. Xem [bản ghi triển khai](../changes/seller-role-disabled-2026-10-23.md); các yêu cầu còn lại như bảo vệ admin cuối cùng và chuyển dữ liệu vẫn cần làm riêng.

> **Quy tắc riêng Chung Sức:** xem [User Story và Business Rule](../business/chung-suc.md), gồm các mã BR-CS-* và US-CS-*. Phân biệt yêu cầu đang chờ với lượt tiếp sức thực sự thành công; chính sách thu tiền sau tools vẫn cần chốt.

## 1. Chủ thể và quyền

| Mã | Quy tắc | Vì sao / cách kiểm tra |
| --- | --- | --- |
| BIZ-01 | Chỉ có một chủ thể bán hàng là shop; khách mua từ shop | Không thêm shop/seller ownership vào product, kho, đơn chỉ để hợp thức hóa code cũ |
| BIZ-02 | Role được hỗ trợ: `USER`, `ADMIN`; chủ shop dùng `ADMIN` | Bán hàng là công việc của chủ shop, không cần role `SELLER` |
| BIZ-03 | Đăng ký công khai luôn tạo USER; tạo/sửa account không tự tạo role từ chuỗi tùy ý | Thử `SELLER`/role lạ phải bị từ chối theo hợp đồng đích |
| BIZ-04 | Không tự nâng account seller cũ thành admin; không làm mất admin hoạt động cuối cùng | Đối chiếu mapping chuyển role, test khóa/xóa/hạ quyền đồng thời |
| BIZ-05 | Backend kiểm tra quyền và chủ sở hữu tài nguyên; FE chỉ hỗ trợ trải nghiệm | Sửa localStorage hoặc gọi API trực tiếp không được vượt quyền |
| BIZ-06 | Admin thử mua qua API cá nhân chỉ dùng dữ liệu cá nhân, giá khách hàng và cùng ràng buộc tiền/kho | Quyền quản trị không tự tạo giảm giá hoặc miễn thanh toán |

## 2. Hàng, kho và đơn

| Mã | Quy tắc | Vì sao / cách kiểm tra |
| --- | --- | --- |
| BIZ-07 | Product, variant và inventory thuộc shop; admin quản lý kho chung | Không có “kho riêng của admin” hoặc “kho seller” |
| BIZ-08 | Variant xác định mặt hàng/giá; inventory là đơn vị hàng có thể giao | Không lấy số card/product làm tồn kho thực tế |
| BIZ-09 | Payload hàng số mã hóa khi lưu; list/detail admin không lộ payload; giao hàng đúng chủ đơn | Không log payload, token, mật khẩu hoặc secret trong metadata/audit |
| BIZ-10 | Một inventory item không giao cho hai đơn; hàng `SOLD` không quay lại `AVAILABLE` | Kiểm tra tranh mua cùng hàng và workflow bảo hành thay thế riêng |
| BIZ-11 | Checkout xác thực giỏ, tính tiền ở backend, ghi đơn/ledger/kho nhất quán trong transaction | Thiếu tiền/hết hàng phải hủy thay đổi liên quan, tránh debit dở dang |
| BIZ-12 | Giữ snapshot giá, sản phẩm và bảo hành lúc mua | Sửa catalog hoặc bỏ seller không sửa lại lịch sử đơn |

**Transaction**: nhiều thay đổi DB cùng thành công hoặc cùng hủy. **Concurrency**: nhiều yêu cầu chạy cùng lúc; phải dùng khóa/cập nhật có điều kiện phù hợp để hai khách không mua cùng hàng. Không dùng mỗi việc ẩn nút hoặc kiểm tra tồn ở FE để bảo đảm quy tắc này.

## 3. Giá, tiền và dịch vụ

| Mã | Quy tắc | Vì sao / cách kiểm tra |
| --- | --- | --- |
| BIZ-13 | Không có sellerCode, seller discount, ví nhận tiền hay bước chia hoa hồng seller trong luồng shop đích | Không đổi tên seller thành admin rồi giữ lại nghiệp vụ cũ |
| BIZ-14 | Tiền giữ dạng decimal string ở API/TS; tính bằng công cụ tiền hiện có, không dùng phép tính số thực JS cho nghiệp vụ | Tránh sai số; đối soát số dư và ledger |
| BIZ-15 | Checkout/refund/callback giữ cơ chế chống xử lý lặp theo hợp đồng từng API | Idempotency: gửi lại cùng yêu cầu không ghi tiền/giao hàng lần hai |
| BIZ-16 | Hoàn tiền đi qua workflow/ledger, không sửa số dư bằng UI hoặc sửa lịch sử cho khớp | Theo dõi được nguyên nhân và số tiền đã hoàn |
| BIZ-17 | Giữ riêng nguồn giá checkout variant và báo giá Chung Sức cho tới khi có thay đổi riêng được thiết kế/test | Gỡ seller không được làm Chung Sức mất giá hoặc thay giá checkout ngoài ý muốn |
| BIZ-18 | Chung Sức là dịch vụ shop tiếp sức mã mời; cashback là tích hợp riêng | Không nhầm mã game, voucher, referral provider thành mã seller nội bộ |
| BIZ-19 | Nhà cung cấp hoặc nhiều công cụ bên ngoài không tự trở thành nhiều người bán trên website | Shop vẫn chịu trách nhiệm với khách; giữ quyền truy cập dữ liệu theo account |

## 4. API và vòng đời dữ liệu

- **BIZ-20:** API vận hành shop kiểm tra `ADMIN`, API cá nhân kiểm tra phiên và quyền sở hữu; đường dẫn `/admin` chỉ là quy ước tên, guard mới thực thi quyền. Campaign hiện có route quản trị chưa mang prefix `/admin`; không đổi URL máy móc.
- **BIZ-21:** Namespace seller đã trả `410 FEATURE_RETIRED` trong code tạm ngừng; chỉ gỡ route sau khi consumer đã chuyển và có quyết định dọn tiếp. Giữ dữ liệu lịch sử; không tự bật lại API cũ chỉ vì còn entity/service trên đĩa.
- **BIZ-22:** Mọi thay đổi schema qua migration mới, không sửa lịch sử migration đã phát hành và không bật `synchronize` để tự xóa cấu trúc.
- **BIZ-23:** Giữ account ID, ví, ledger, đơn và snapshot khi chuyển role seller. Archive/drop chỉ sau kiểm kê FK, consumer, sao lưu, thử khôi phục và đối soát.
- **BIZ-24:** Đổi role phải xem lại token/session đang tồn tại. Không mặc định token cũ tự cập nhật hoặc mọi endpoint đều đọc lại DB.
- **BIZ-25:** Seed không tạo lại seller/code/rule giá seller. Không quảng bá tài khoản demo cũ như cách vận hành shop.

## 5. Quy tắc viết và dùng tài liệu

- **BIZ-26:** Ưu tiên mô hình trong [nghiệp vụ](../business/single-owner-shop.md) khi viết yêu cầu mới. Docs Chung Sức cũ có nhãn lịch sử dùng để tra cứu; source là bằng chứng hành vi hiện tại, không tự trở thành yêu cầu đích.
- **BIZ-27:** Khi báo cáo, phân biệt điều đã đọc trong source, yêu cầu của chủ dự án, suy luận, đề xuất và điều chưa kiểm chứng theo [research-reasoning-tutor.md](../../research-reasoning-tutor.md). Giải thích thuật ngữ bằng tiếng Việt ngay lần đầu dùng.
- **BIZ-28:** Không ghi “đã sửa”, “đã chạy”, “đã bảo đảm” nếu chỉ mới có docs hoặc test chưa chạy. Luôn dẫn file/hàm làm bằng chứng cho phát biểu về code.
- **BIZ-29:** Giữ rule kỹ thuật về schema, helper, cấu trúc và frontend hiện có; “cyber marketplace” trong design chỉ là tên phong cách giao diện, không xác định mô hình nhiều người bán.

Khi review thay đổi, dùng các mã `BIZ-*` để chỉ rõ quy tắc liên quan và dẫn kết quả kiểm thử. **Review** là đọc/kiểm tra thay đổi trước khi đưa vào sử dụng; không cần đưa toàn bộ bảng quy tắc vào giao diện dành cho khách.
