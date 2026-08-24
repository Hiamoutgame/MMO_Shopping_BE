# Triển khai Giai đoạn 1: Hạ tầng TypeORM & Config

Khởi tạo cấu trúc dự án và cài đặt cấu hình cơ sở dữ liệu PostgreSQL qua TypeORM. Đảm bảo validate biến môi trường chuẩn xác.

## User Review Required

Cần đảm bảo file `.env` đã được thiết lập đúng các biến như:
`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `PORT` (nếu cần đổi).
Do `.env` bị ignore, bạn cần tự cấu hình các giá trị thực tế sau khi tôi cài đặt.

## Open Questions

- Bạn có muốn tôi sử dụng `joi` hay dùng class-validator (như roadmap) để validate `.env`? (Tôi sẽ dùng class-validator theo đúng roadmap).

## Proposed Changes

---

### [Cài đặt Dependency]

- Cài đặt `@nestjs/config`, `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, `class-transformer`.
- Cấu hình CLI cho TypeORM vào `package.json`.

---

### [Tạo các cấu trúc config & database]

#### [NEW] [src/config/env.validation.ts](file:///f:/Coding/Project/MMO_Shopping/MMO_Shopping_BE/src/config/env.validation.ts)
Sử dụng `class-validator` để validate biến môi trường.

#### [NEW] [src/config/database.config.ts](file:///f:/Coding/Project/MMO_Shopping/MMO_Shopping_BE/src/config/database.config.ts)
Đăng ký và khởi tạo thông số TypeORM cho NestJS (sử dụng registerAs từ `@nestjs/config`).

#### [NEW] [src/database/data-source.ts](file:///f:/Coding/Project/MMO_Shopping/MMO_Shopping_BE/src/database/data-source.ts)
Cấu hình độc lập sử dụng cho TypeORM CLI chạy Migration.

#### [MODIFY] [src/app.module.ts](file:///f:/Coding/Project/MMO_Shopping/MMO_Shopping_BE/src/app.module.ts)
Import `ConfigModule` và `TypeOrmModule.forRootAsync()`.

#### [MODIFY] [package.json](file:///f:/Coding/Project/MMO_Shopping/MMO_Shopping_BE/package.json)
Thêm scripts: `typeorm:migration:generate`, `typeorm:migration:run`, `typeorm:migration:revert`.

## Verification Plan

### Automated Tests
- Chạy `npm run build` để kiểm tra compile.
- Chạy `npm run typeorm:migration:generate -- src/database/migrations/InitialTest` (sẽ lỗi kết nối nếu .env sai, nhưng kịch bản lệnh cần đúng).
