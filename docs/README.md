# Tài liệu MMO Shopping

Quyết định nghiệp vụ ngày **23/10/2026**: MMO Shopping là **shop hàng số do một chủ shop vận hành**. Chủ shop tự cung cấp hàng/dịch vụ và dùng quyền `ADMIN` để bán hàng, quản lý kho, đơn, thanh toán và hỗ trợ. Khách đăng ký quyền `USER` để mua từ shop.

Đọc theo thứ tự:

| Nội dung | Tài liệu | Giải quyết câu hỏi |
| --- | --- | --- |
| Nghiệp vụ | [Mô hình một chủ shop](business/single-owner-shop.md) | Ai bán, ai mua, vì sao admin quản lý kho, seller cũ nghĩa gì? |
| API | [API theo mô hình shop](api/single-owner-shop.md) | Giữ API nào, xử lý seller ra sao, code hiện tại khác thiết kế ở đâu? |
| Plan | [Kế hoạch chuyển đổi](plan/single-owner-shop.md) | Sửa theo thứ tự nào, dữ liệu cũ xử lý thế nào, kiểm tra ra sao? |
| Rule | [Quy tắc nghiệp vụ](rule/business.md) | Điều gì phải luôn đúng khi sửa backend/frontend? |

Các tài liệu chi tiết tiếp tục dùng:

- [User stories](database/userStory.md): việc khách và chủ shop cần làm.
- [Chung Sức — User Story và Business Rule](business/chung-suc.md): luồng gửi mã mời, quyền khách/chủ shop, giới hạn mỗi mã, trạng thái và các quyết định còn thiếu về tools/tính tiền.
- [Entities](database/entities.md): thiết kế dữ liệu cốt lõi; không phải bản chụp toàn bộ database đang chạy.
- [Mục lục API](api/README), [quy ước API](api/conventions.md).
- [Backend](structure/BE.md), [frontend](structure/FE.md), [schema](rule/schema.md), [quy ước frontend](rule/conventions.md).
- [Hướng dẫn giải thích cho fresher](../research-reasoning-tutor.md).
- [Hoàn Phí 247: kết quả crawl và luồng hoạt động](research/hoanphi247-workflow-2026-10-23.md): phân biệt kiểm tra live, tài liệu API trong repo và cách MMO kết nối theo từng khách.
- [Triển khai tạm ngừng role seller](changes/seller-role-disabled-2026-10-23.md): hành vi code mới, cách giữ tài khoản cũ và kết quả kiểm tra.

**Trạng thái:** đã rà soát docs và triển khai bước tạm ngừng role seller trong code theo yêu cầu tiếp theo. Role mới chỉ USER/ADMIN, API seller trả 410, tài khoản seller cũ dùng quyền khách mà vẫn giữ dữ liệu. Chuyển dữ liệu thật, dọn schema và phát hành không được thực hiện trong đợt này; xem bản ghi triển khai ở trên. Tài liệu kiến trúc Chung Sức/README cũ có nhãn lịch sử để giữ dấu vết, không dùng phần seller cũ làm yêu cầu sản phẩm mới.
