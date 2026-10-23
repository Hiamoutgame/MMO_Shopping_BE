# Tiêu Chuẩn Thiết Kế Schema & Entity

Áp dụng cho NestJS + TypeORM + PostgreSQL. Mục tiêu là schema rõ nghĩa, nhất quán, dễ migration và đủ an toàn cho dữ liệu tiền/giao dịch.

## Phạm vi nghiệp vụ từ 23/10/2026

- Tuân thủ [quy tắc shop một chủ](business.md): `ADMIN` vận hành shop và kho chung, `USER` mua hàng; không thêm seller/shop ownership vào catalog, inventory hoặc order cho nhu cầu hiện tại.
- Role đích chỉ `USER`/`ADMIN`; source/seed cũ còn `SELLER` cần chuyển theo [plan](../plan/single-owner-shop.md), không xóa dữ liệu trực tiếp để ép khớp docs.
- Giữ lịch sử đơn, ledger, payload mã hóa và quan hệ account khi chuyển role; kiểm kê các cột seller trong migration và schema thật. Không sửa migration đã phát hành; archive/drop là bước riêng sau sao lưu và đối soát.

## 1. Kiến Trúc Module

- Entity của module nào đặt trong `src/modules/<module>/entities/`.
- Kiến trúc là **modular monolith, DDD-inspired**: chia bounded context rõ, nhưng vẫn cùng database.
- Module chỉ export service/public provider cần thiết; controller/repository nội bộ không export tràn lan.
- Quan hệ TypeORM dùng direct import entity file, không dùng barrel `index.ts`.
- Tránh vòng import nghiệp vụ. Module điều phối cấp cao gọi qua service/port, không để module thấp import ngược module cao.

## 2. Naming & Type

| Quy ước         | Chuẩn                                               |
| :-------------- | :-------------------------------------------------- |
| Table/column    | `snake_case`, số nhiều cho table                    |
| Entity/property | `PascalCase` cho class, `camelCase` cho property    |
| Primary key     | `uuid`, `@PrimaryGeneratedColumn('uuid')`           |
| Timestamp       | `timestamptz`                                       |
| Money           | `numeric(19,4)` trong DB, `string` trong TS entity  |
| Currency        | `char(3)`, mặc định `VND` khi phù hợp               |
| Enum            | PostgreSQL enum, giá trị viết hoa                   |
| JSON            | `jsonb`, chỉ dùng cho metadata/attributes linh hoạt |

## 3. Thứ Tự Field

1. Primary key.
2. Foreign key và relation.
3. Core business fields.
4. Detail/metadata fields.
5. Audit/tracking timestamps.

## 4. Base Entity

Base entity đặt tại `src/common/base/`:

- `UuidEntity`: chỉ có `id`.
- `AuditableEntity`: `id`, `createdAt`, `updatedAt`.
- `SoftDeletableEntity`: thêm `deletedAt`.

Master entity có thể soft delete. Transaction entity mặc định không soft delete để giữ audit trail.

## 5. Constraint & Transaction

- Mọi quantity phải `> 0`.
- Money không âm, riêng transaction amount phải `> 0`.
- `discount_amount <= subtotal` và `total_amount = subtotal - discount_amount`.
- Unique nullable cần dùng partial unique index, ví dụ `payment_transaction_id IS NOT NULL`.
- Một account chỉ có một cart và một wallet VND.
- Voucher usage phải có bảng redemption làm source of truth, không chỉ dựa vào counter.
- Wallet debit/credit phải chạy trong DB transaction, dùng row lock hoặc atomic conditional update; không chỉ dựa vào `@VersionColumn`.
- Không gọi HTTP external API bên trong DB transaction. Ghi `OutboxEvent` trong transaction rồi worker xử lý sau commit.
- Payload nhạy cảm như inventory/account/tool secret phải mã hóa và có key version khi cần rotate.

## 6. Migration

- `synchronize: false` cho mọi môi trường.
- Mọi thay đổi schema phải đi qua TypeORM migration.
- Migration cần được review thủ công: enum, FK, unique, partial index, check constraint, on delete policy.
