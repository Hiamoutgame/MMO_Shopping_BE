# Tiêu Chuẩn Viết Helper

Helper chỉ dùng cho logic thuần túy, tái sử dụng được và không phụ thuộc trạng thái hệ thống. Logic nghiệp vụ quan trọng phải nằm trong service/domain module.

## 1. Mục Đích

- Tái sử dụng các thao tác nhỏ, rõ nghĩa.
- Giữ helper stateless/pure khi có thể.
- Làm code dễ đọc, dễ test, không biến helper thành nơi chứa business rule.

## 2. Nhóm Helper

| Nhóm         | Ví dụ                                                                |
| :----------- | :------------------------------------------------------------------- |
| `identifier` | chuẩn hóa UUID, generate mã ngắn, normalize danh sách id             |
| `formatter`  | format tiền tệ, datetime/timezone, slug                              |
| `validator`  | email, phone, range, null/empty                                      |
| `converter`  | parse JSON/XML an toàn, mapping DTO đơn giản, encode/decode tiện ích |

## 3. Nguyên Tắc

- Tên hàm là động từ rõ hành động: `formatCurrency()`, `isValidEmail()`, `extractUserId()`.
- Khai báo type đầu vào/đầu ra rõ ràng; tránh `any`.
- Không truy cập database, repository, request context, config động hoặc external API.
- Không chứa logic voucher, checkout, ví, inventory, auth, bảo hành hoặc mã tiếp sức.
- Không nuốt lỗi nghiệp vụ/bảo mật bằng cách trả `null`, `undefined` hoặc `false`.
- Helper parse/convert dữ liệu có thể trả `null` hoặc `Result` nếu lỗi là dữ liệu không hợp lệ dự kiến.
- Lỗi bất thường nên throw typed error hoặc để service xử lý qua exception filter.

## 4. Ranh Giới Với Domain Service

| Không đặt trong helper          | Đặt ở đâu                                  |
| :------------------------------ | :----------------------------------------- |
| Tính discount voucher           | `CommerceService`                          |
| Kiểm tra số dư và ghi ledger    | `FinanceService`                           |
| Giữ/bán inventory               | `InventoryService`                         |
| Validate refresh token/session  | `Identity/AuthService`                     |
| Dispatch mã tiếp sức sang tools | `AutomationService` + `IntegrationService` |
| Duyệt bảo hành                  | `SupportService`                           |
