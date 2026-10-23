# Quy Ước Frontend

> Mục đích: gom các quy tắc frontend quan trọng để developer và AI agent có thể đọc nhanh, hiểu đúng phạm vi, và triển khai nhất quán.
> Nguồn tổng hợp: `MMO_Shopping_FE/docs/rules/structure.md`, `MMO_Shopping_FE/docs/rules/reuse.md`, `MMO_Shopping_FE/docs/rules/design.md`.

> **Nghiệp vụ — 23/10/2026:** Tuân thủ [rule shop một chủ](business.md). `ADMIN` là chủ shop, có công cụ bán hàng và quản lý kho chung; `USER` là khách mua. Không xây thêm seller dashboard/mã seller/hoa hồng seller từ tài liệu cũ. “Cyber marketplace” bên dưới chỉ là phong cách giao diện. Giữ riêng cashback referral và mã mời game; xem [plan](../plan/single-owner-shop.md) trước khi dọn phần cũ.

## 1. Phạm Vi

Tài liệu này áp dụng cho source frontend trong `MMO_Shopping_FE/src`.

Khi chỉnh hoặc thêm UI, ưu tiên theo thứ tự:

1. Giữ đúng cấu trúc thư mục hiện có.
2. Tái sử dụng layout, component, hook, helper đã có.
3. Giữ visual style dark SaaS/cyber marketplace hiện tại.
4. Không thêm thư viện, route, API flow hoặc pattern mới nếu chưa thật sự cần.

## 2. Cấu Trúc Thư Mục

| Thư mục | Trách nhiệm |
| :-- | :-- |
| `assets` | Tài nguyên tĩnh như ảnh, icon, font. Không đặt logic ở đây. |
| `common/apis` | API services, request/response config, kết nối backend. |
| `common/const` | Hằng số dùng chung như route, storage key, API path. |
| `common/libs` | Helper/wrapper dùng chung như axios, storage, formatter, `cn`. |
| `common/mapping` | Mapper đổi dữ liệu giữa API model và UI model. Hiện source có thể chưa có thư mục này, nhưng đây là vị trí chuẩn khi cần mapper. |
| `common/mocks` | Mock data cho demo hoặc UI testing khi backend chưa sẵn sàng. |
| `common/models` | Type, interface, domain model dùng chung. |
| `common/stores` | Client/session state dùng Zustand. Thư mục này đang tồn tại trong source hiện tại. |
| `components` | UI component tái sử dụng. |
| `hooks` | Custom React hooks dùng lại được. |
| `layouts` | Khung trang như public layout, auth layout, admin layout khi có. |
| `pages` | Màn hình chính, thường tương ứng với route. |
| `routes` | Khai báo route, lazy import, route guard khi có. |

Root files:

- `main.tsx`: entry point, render React app vào DOM.
- `App.tsx`: root component, hiện render `AppRouter`.

## 3. Phân Tầng Trách Nhiệm

| Tầng | Thư mục | Được làm | Không được làm |
| :-- | :-- | :-- | :-- |
| Layout | `src/layouts` | Bọc cấu trúc trang, đặt Header/Footer/Sidebar/main. | Không gọi API, không chứa business logic của page cụ thể. |
| Page | `src/pages` | Điều phối workflow, gọi API/store, xử lý form, loading, empty, error. | Không nhồi UI nhỏ lặp lại nếu có thể tách component. |
| Component | `src/components` | Nhận props, render UI, phát event như `onClick`, `onChange`. | Không phụ thuộc trực tiếp vào API service hoặc mock data. |
| Hook | `src/hooks` | Đóng gói logic React tái sử dụng. | Không chứa logic chỉ dùng cho đúng một page nếu chưa cần tái sử dụng. |
| Common | `src/common` | Chứa model, helper, API, mapper, store dùng chung. | Không import ngược từ `pages`, `layouts`, hoặc component page-specific. |

Chiều import khuyến nghị:

```text
routes
  -> layouts/pages
  -> components/hooks/common/stores/common/apis
  -> common/models/common/libs/common/const
```

## 4. Quy Ước Layout

Layout là wrapper cho cấu trúc trang.

Layout nên:

- Nhận `children: React.ReactNode`.
- Định vị Header, Footer, Sidebar và vùng nội dung chính.
- Giữ spacing, background, max-width hoặc shell chung của nhóm page.
- Dùng lại cho nhiều page có cùng khung.

Layout không nên:

- Gọi API.
- Chứa xử lý dữ liệu phức tạp.
- Phụ thuộc vào một page cụ thể.

Ví dụ:

```tsx
interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-[#07080D] text-white flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
```

## 5. Quy Ước Component

Component trong `src/components` là UI tái sử dụng.

Component nên:

- Nhận dữ liệu qua props.
- Phát event ra ngoài qua callback props.
- Cho phép truyền `className` khi cần mở rộng style.
- Gộp class bằng `cn()` để tránh Tailwind class bị xung đột.
- Kế thừa native props nếu component bọc HTML element phổ biến.
- Giữ internal state nhỏ, chỉ phục vụ UI cục bộ như open/close, focus, hover.

Component không nên:

- Tự gọi API domain.
- Tự đọc mock data.
- Tự quyết định workflow nghiệp vụ lớn.
- Chứa logic chỉ đúng cho một page nhưng lại đặt ở component dùng chung.

Ví dụ:

```tsx
import type React from "react";
import { cn } from "../../common/libs/cn";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "px-5 py-3 rounded-xl font-semibold transition-all",
        variant === "primary" &&
          "bg-gradient-to-r from-[#0EA5FF] to-[#7C3DFF] text-white shadow-lg",
        variant === "secondary" &&
          "bg-[#0C101CEE] border border-white/10 text-[#DCE4F8]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

## 6. Quy Ước Data Và API

Khi backend chưa sẵn sàng:

- Có thể dùng `common/mocks` để demo UI.
- Mock phải được đặt tên rõ ràng, ví dụ `MOCK_PRODUCTS`, `MOCK_USER`.
- Page dùng mock cần dễ thay bằng API sau này.

Khi kết nối backend:

- Ưu tiên một HTTP client thống nhất.
- API service đặt theo domain trong `common/apis`.
- DTO backend khác UI model thì thêm mapper trong `common/mapping`.
- Component không nhận DTO thô nếu shape đó làm UI bị phụ thuộc backend quá chặt.
- Response/error/loading nên được chuẩn hóa ở API/hook/page, tránh lặp xử lý ở nhiều nơi.

State:

- Zustand phù hợp cho client/session state như auth metadata, cart draft hoặc UI state dùng chung.
- Server state như cart, order, wallet, support request phải lấy backend làm nguồn dữ liệu chuẩn sau khi API đã sẵn sàng.
- Không dùng localStorage làm nguồn dữ liệu nghiệp vụ lâu dài cho order, wallet hoặc payment.

Money:

- Dữ liệu tiền từ API nên giữ dạng decimal string trong model/DTO.
- Không dùng JavaScript `number` để tính nghiệp vụ tiền.
- Chỉ format tiền ở tầng render hoặc formatter.

## 7. Quy Ước UI Và Design

Visual style chính:

- Dark SaaS / Cyber Marketplace.
- Background chính: `#07080D`.
- Panel/card tối, viền mảnh, blur nhẹ, shadow sâu.
- Màu nhấn cyan/violet gradient: `#0EA5FF` -> `#7C3DFF` hoặc `#21D4FD` -> `#8A2EFF`.
- Success/online: `#35FFB1`, `#42E6A4`, `#2DD4BF`.
- Text chính: `#FFFFFF`, `#F8FAFC`.
- Text phụ: `#94A3B8`, `#8C96B5`, `#6F7895`.
- Muted technical text: `#566079`.

Typography:

- `Geist`: headline/title, weight khoảng 600.
- `Inter`: body, button label, description, weight khoảng 400-800.
- `Geist Mono`: eyebrow, technical label, price, uppercase khi phù hợp.

Radius tham chiếu:

- Pill/status: `999`.
- Navbar: `32`.
- Large panel/CTA: `24`.
- Card/nav item: `18`.
- Button: `14`.
- Small icon/logo: `10`.

## 8. Quy Ước Page

Page nên có:

- Một mục tiêu rõ ràng tương ứng route.
- Loading state khi chờ dữ liệu.
- Empty state khi không có dữ liệu.
- Error state khi request fail.
- Unauthorized state hoặc redirect khi cần đăng nhập.
- Disabled state cho button/form khi đang submit.
- Responsive layout kiểm tra được trên mobile và desktop.

Page không nên:

- Dùng nền sáng nếu không có yêu cầu thiết kế mới.
- Đưa text dài vào container hẹp gây tràn.
- Lặp lại card/form lớn ở nhiều page mà không tách component.
- Thêm nav item mới nếu chưa có route hoặc yêu cầu sản phẩm rõ ràng.

Header/nav hiện tại dùng các mục chính: Sản phẩm, Giỏ hàng, Tiếp sức, Chính sách, Liên hệ. Không thêm mục "Bảo hành" vào nav chính nếu chưa có route tương ứng.

## 9. Quy Ước Khi Làm Thiết Kế `.pen`

Nếu làm việc trên canvas Pencil `.pen`, dùng các rule sau như chuẩn thiết kế:

- Mỗi page là một top-level frame, width `1440`, height `fit_content`, layout `vertical`, fill `#07080D`.
- Node name dùng tiếng Việt rõ nghĩa, ví dụ `Trang Chính Sách`, `Thanh Điều Hướng`, `Nút Gửi Yêu Cầu`.
- Header wrapper full width, navbar width `1200`, height `64`, radius `32`, fill `#0B1020CC`.
- Body dùng layout vertical, gap khoảng `80`, padding `[96,112]` hoặc `[72,96]`.
- Footer full width, padding `[28,112]`, text phụ dùng tone muted.
- Text dài dùng fixed-width/fill container để tránh tràn.
- Không đặt text/card trực tiếp ở document root; root chỉ chứa page frame.
- Không dùng percentage, margin, stretch, baseline nếu tool/schema không hỗ trợ ổn định.

## 10. Checklist Trước Khi Hoàn Thành

- Đặt file đúng thư mục theo trách nhiệm.
- Không để layout gọi API.
- Không để component dùng API/mock trực tiếp.
- Có loading, empty, error, disabled state cho page có request hoặc submit.
- Dùng lại component/helper đã có trước khi tạo mới.
- Giữ palette dark SaaS và token chính.
- Đối chiếu route/nav với `APP_CONSTANTS.ROUTES`.
- Chạy `pnpm lint` và `pnpm build` khi thay đổi source frontend.
